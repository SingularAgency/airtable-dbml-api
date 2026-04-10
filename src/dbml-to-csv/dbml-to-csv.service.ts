import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as Papa from 'papaparse';

interface TableInfo {
  tableName: string;
  originalSheetName: string;
  path: string;
  tableDescription: string;
}

interface FieldInfo {
  businessDesc: string;
  technicalDesc: string;
  readOnly: boolean;
}

interface CsvRow {
  'Table Name': string;
  'Original Sheet Name': string;
  'Path': string;
  'Table Description': string;
  'Field Name': string;
  'Field Type': string;
  'Field Description': string;
  'technical_desc': string;
  'read_only': string;
}

@Injectable()
export class DbmlToCsvService {
  private readonly logger = new Logger(DbmlToCsvService.name);

  async parseDbmlToCsv(
    dbmlContent: string,
    updateProgress: (progress: number, description?: string) => void,
  ): Promise<string> {
    this.logger.log('Starting DBML to CSV conversion');
    updateProgress(10, 'Parsing DBML content');

    if (!dbmlContent || dbmlContent.trim().length === 0) {
      throw new BadRequestException('DBML content is empty');
    }

    // Extract all tables using regex
    // Pattern matches: Table tableName { ... content ... }
    // Use a more robust approach to handle nested braces and content
    const tables: Array<{ name: string; content: string }> = [];
    const tableRegex = /Table\s+(\w+)\s*\{/g;
    let match;
    let lastIndex = 0;

    while ((match = tableRegex.exec(dbmlContent)) !== null) {
      const tableName = match[1];
      const startIndex = match.index + match[0].length;
      
      // Find the matching closing brace
      let braceCount = 1;
      let endIndex = startIndex;
      
      while (endIndex < dbmlContent.length && braceCount > 0) {
        if (dbmlContent[endIndex] === '{') {
          braceCount++;
        } else if (dbmlContent[endIndex] === '}') {
          braceCount--;
        }
        endIndex++;
      }
      
      if (braceCount === 0) {
        // Extract content (excluding the closing brace)
        const content = dbmlContent.substring(startIndex, endIndex - 1);
        tables.push({
          name: tableName,
          content: content,
        });
      }
    }

    if (tables.length === 0) {
      throw new BadRequestException('No tables found in DBML content');
    }

    this.logger.log(`Found ${tables.length} tables to process`);
    updateProgress(20, `Processing ${tables.length} tables`);

    const csvData: CsvRow[] = [];
    let processedTables = 0;

    for (const table of tables) {
      processedTables++;
      const tableProgress = 20 + Math.floor((processedTables / tables.length) * 60);
      updateProgress(tableProgress, `Processing table: ${table.name}`);

      // Extract table note
      // Handle both single and double quotes, and escaped quotes within
      let tableNote = '';
      const singleQuoteMatch = table.content.match(/note:\s*'([^']*(?:'[^']*)*)'/);
      const doubleQuoteMatch = table.content.match(/note:\s*"([^"]*(?:"[^"]*)*)"/);
      
      if (singleQuoteMatch) {
        tableNote = singleQuoteMatch[1];
      } else if (doubleQuoteMatch) {
        tableNote = doubleQuoteMatch[1];
      }

      // Parse table information
      const tableInfo = this.parseTableNote(tableNote, table.name);
      
      if (!tableInfo.tableDescription && tableNote) {
        this.logger.warn(`Could not extract table description for table: ${table.name}`);
        this.logger.debug(`Table note content: ${tableNote.substring(0, 200)}...`);
      }

      // Extract all fields
      // Pattern matches: fieldName fieldType [note: '...']
      // Field names can contain underscores, numbers, letters, apostrophes, and other special chars
      // Field types are alphanumeric with underscores
      const fields: Array<{ name: string; type: string; note: string }> = [];
      
      // Split by lines and process each line that looks like a field definition
      const lines = table.content.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        // Skip empty lines and the table note line
        if (!trimmedLine || trimmedLine.startsWith('note:')) {
          continue;
        }
        
        // Match field pattern: fieldName fieldType [note: '...']
        // Field name can contain: letters, numbers, underscores, apostrophes, and other chars
        // Use a more flexible pattern: capture everything until space + fieldType + space + [note:
        // Try single quotes first
        const singleQuoteMatch = trimmedLine.match(/^([^\s]+)\s+(\w+)\s*\[note:\s*'([^']+)'\]/);
        if (singleQuoteMatch) {
          fields.push({
            name: singleQuoteMatch[1],
            type: singleQuoteMatch[2],
            note: singleQuoteMatch[3],
          });
          continue;
        }
        
        // Try double quotes
        const doubleQuoteMatch = trimmedLine.match(/^([^\s]+)\s+(\w+)\s*\[note:\s*"([^"]+)"\]/);
        if (doubleQuoteMatch) {
          fields.push({
            name: doubleQuoteMatch[1],
            type: doubleQuoteMatch[2],
            note: doubleQuoteMatch[3],
          });
        }
      }
      
      this.logger.debug(`Extracted ${fields.length} fields from table: ${table.name}`);

      // Process each field
      for (const field of fields) {
        const fieldInfo = this.parseFieldNote(field.note);
        
        if (!fieldInfo.businessDesc && field.note) {
          this.logger.warn(`Could not extract business description for field: ${field.name} in table: ${table.name}`);
          this.logger.debug(`Field note content: ${field.note.substring(0, 200)}...`);
        }

        csvData.push({
          'Table Name': tableInfo.tableName,
          'Original Sheet Name': tableInfo.originalSheetName,
          'Path': tableInfo.path,
          'Table Description': tableInfo.tableDescription,
          'Field Name': field.name,
          'Field Type': field.type,
          'Field Description': fieldInfo.businessDesc,
          'technical_desc': fieldInfo.technicalDesc,
          'read_only': fieldInfo.readOnly ? 'true' : 'false',
        });
      }
    }

    this.logger.log(`Generated ${csvData.length} CSV rows`);
    updateProgress(90, 'Generating CSV file');

    // Convert to CSV using PapaParse
    const csvString = Papa.unparse(csvData);

    updateProgress(100, 'CSV generation completed');
    return csvString;
  }

  private parseTableNote(note: string, tableName: string): TableInfo {
    const result: TableInfo = {
      tableName: tableName,
      originalSheetName: '',
      path: '',
      tableDescription: '',
    };

    if (!note || note.trim().length === 0) {
      return result;
    }

    // Normalize line breaks (handle both \n and actual newlines)
    const normalizedNote = note.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

    // Extract table name from note if available (format: ### table_name Table)
    const tableNameMatch = normalizedNote.match(/###\s+(\w+)\s+Table/);
    if (tableNameMatch) {
      result.tableName = tableNameMatch[1];
    }

    // Check if it's SmartSheet format (has Original Sheet Name and Path)
    const hasOriginalSheetName = normalizedNote.includes('Original Sheet Name:');
    const hasPath = normalizedNote.includes('Path:');

    if (hasOriginalSheetName) {
      // Extract Original Sheet Name
      // Match: "Original Sheet Name: <name>" followed by newline, "Path:", or " - "
      const originalSheetMatch = normalizedNote.match(/Original Sheet Name:\s*([^\n]+?)(?:\n|Path:|$)/);
      if (originalSheetMatch) {
        result.originalSheetName = originalSheetMatch[1].trim();
      }

      // Extract Path
      if (hasPath) {
        // Match: "Path: <path>" followed by newline or " - "
        const pathMatch = normalizedNote.match(/Path:\s*([^\n]+?)(?:\n| - |$)/);
        if (pathMatch) {
          result.path = pathMatch[1].trim();
        }
      }
    }

    // Extract description (everything after the last " - " separator)
    // Split by " - " and take the last part
    const parts = normalizedNote.split(/\s-\s/);
    if (parts.length > 1) {
      let description = parts[parts.length - 1].trim();
      // Clean description by removing technical table name pattern
      description = this.cleanTableDescription(description, result.tableName);
      result.tableDescription = description;
    }

    return result;
  }

  private parseFieldNote(note: string): FieldInfo {
    const result: FieldInfo = {
      businessDesc: '',
      technicalDesc: '',
      readOnly: false,
    };

    if (!note || note.trim().length === 0) {
      return result;
    }

    // Extract business_desc - split by ", technical desc:" to handle commas in description
    const technicalDescIndex = note.indexOf(', technical desc:');
    if (technicalDescIndex !== -1) {
      const businessDescPart = note.substring(0, technicalDescIndex);
      const businessDescMatch = businessDescPart.match(/business desc:\s*(.+)/);
      if (businessDescMatch && businessDescMatch[1]) {
        result.businessDesc = businessDescMatch[1].trim();
        // Remove trailing period and comma if present
        result.businessDesc = result.businessDesc.replace(/[.,]\s*$/, '').trim();
      }
    } else {
      // Fallback: try regex if split doesn't work
      const businessDescMatch = note.match(/business desc:\s*(.+?)(?:\s*,\s*technical desc:|$)/);
      if (businessDescMatch && businessDescMatch[1]) {
        result.businessDesc = businessDescMatch[1].trim();
        result.businessDesc = result.businessDesc.replace(/[.,]\s*$/, '').trim();
      }
    }

    // Extract technical_desc - split by ", readonly field:" to handle commas in description
    const readOnlyIndex = note.indexOf(', readonly field:');
    if (readOnlyIndex !== -1) {
      const technicalDescPart = note.substring(
        note.indexOf('technical desc:') + 'technical desc:'.length,
        readOnlyIndex,
      );
      if (technicalDescPart) {
        result.technicalDesc = technicalDescPart.trim();
      }
    } else {
      // Fallback: try regex if split doesn't work
      const technicalDescMatch = note.match(/technical desc:\s*(.+?)(?:\s*,\s*readonly field:|$)/);
      if (technicalDescMatch && technicalDescMatch[1]) {
        result.technicalDesc = technicalDescMatch[1].trim();
      }
    }

    // Extract read_only
    const readOnlyMatch = note.match(/readonly field:\s*(true|false)/i);
    if (readOnlyMatch) {
      result.readOnly = readOnlyMatch[1].toLowerCase() === 'true';
    }

    return result;
  }

  private cleanTableDescription(description: string, tableName: string): string {
    if (!description || !tableName) {
      return description;
    }

    // Try multiple patterns to remove the technical table name prefix
    // Pattern 1: "The {table_name} table " (exact match with underscores)
    const exactPattern = new RegExp(`^The\\s+${this.escapeRegex(tableName)}\\s+table\\s+`, 'i');
    if (exactPattern.test(description)) {
      return description.replace(exactPattern, '').trim();
    }

    // Pattern 2: "The {TableName} table " (PascalCase variations)
    const variations = [
      tableName,
      this.toPascalCase(tableName),
      this.toTitleCase(tableName),
      // Replace underscores with spaces and ampersands for display names
      tableName.replace(/_/g, ' '),
      tableName.replace(/_/g, ' & '),
      // Handle cases where underscores become spaces with special chars
      tableName.replace(/_/g, ' & ').replace(/\s+/g, ' '),
    ];

    for (const variation of variations) {
      const escapedVariation = this.escapeRegex(variation);
      const pattern = new RegExp(`^The\\s+${escapedVariation}\\s+table\\s+`, 'i');
      if (pattern.test(description)) {
        return description.replace(pattern, '').trim();
      }
    }

    // Pattern 3: Generic pattern - remove "The [anything] table " if it starts with "The"
    // This handles cases where the name in description differs significantly from tableName
    // Match: "The " + (any word characters, spaces, &, -) + " table "
    const genericPattern = /^The\s+([A-Za-z0-9\s&_-]+?)\s+table\s+/i;
    if (genericPattern.test(description) && description.toLowerCase().startsWith('the')) {
      const cleaned = description.replace(genericPattern, '').trim();
      // Make sure we didn't remove too much (at least 10 chars should remain)
      if (cleaned.length >= 10) {
        return cleaned;
      }
    }

    // If no pattern matches, return description as-is
    return description;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private toPascalCase(str: string): string {
    return str
      .split(/[_\s-]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  private toTitleCase(str: string): string {
    return str
      .split(/[_\s-]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}
