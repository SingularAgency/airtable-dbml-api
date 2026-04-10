import { Injectable } from '@nestjs/common';
import { GeminiService } from '../gemini/gemini.service';
import { BusinessDescriptionStrategy } from './Dto/create-json-dbml.dto';

export type TypeMode = 'dbml' | 'smartsheet' | 'airtable';

@Injectable()
export class JsonDbmlService {
  constructor(private readonly geminiService: GeminiService) {}

  /**
   * Determines if an Airtable field is readonly based on its type
   * @param field The field object from Airtable
   * @returns true if the field is readonly, false otherwise
   */
  private isReadonlyField(field: any): boolean {
    const readonlyFieldTypes = [
      'autoNumber',
      'createdTime', 
      'lastModifiedTime',
      'lastModifiedBy',
      'createdBy',
      'formula',
      'rollup',
      'lookup',
      'multipleLookupValues',
      'count',
      'button',
      'created_by',
      'externalSyncSource'
    ];

    // Check if the field type is in the readonly list
    if (readonlyFieldTypes.includes(field.type)) {
      return true;
    }

    // Special case: duration when calculated via formula
    if (field.type === 'duration' && field.options?.isFormula) {
      return true;
    }

    // Special case: record_id when it's a formula
    if (field.name === 'record_id' && field.type === 'formula') {
      return true;
    }

    // Check if field is computed from extensions or sync sources
    if (field.options?.isComputed || field.options?.isSynced) {
      return true;
    }

    return false;
  }

  /**
   * Cleans a field name by removing or replacing unwanted characters.
   * @param fieldName The original field name.
   * @returns The cleaned field name.
   */
  private cleanFieldName(fieldName: string): string {
    const replacements = {
      '/': '', '-': '', '#': 'Numeral', '&': '',
      '%': '', '$': '', '.': '', '´': '', ':': '', '?': '', '*': '',
    };
    for (const [char, replacement] of Object.entries(replacements)) {
      fieldName = fieldName.replace(new RegExp(`\\${char}`, 'g'), replacement);
    }
    fieldName = fieldName.replace(/\(([^)]+)\)/g, '_$1'); // Converts "(from Talent)" -> "_from_Talent"
    return fieldName.trim().replace(/\s+/g, '_'); // Replaces spaces with "_"
  }

  /**
   * Maps Airtable field types to DBML-compatible types.
   * @param airtableType The Airtable field type.
   * @param useAirtableTypes If true, uses Airtable types directly; otherwise, maps to DBML types.
   * @param typeMode Optional type mode for SmartSheet support (dbml, smartsheet, airtable).
   * @param originalSmartSheetType Optional original SmartSheet type (for smartsheet mode).
   * @returns The field type for DBML.
   */
  private mapFieldType(
    airtableType: string,
    useAirtableTypes: boolean,
    typeMode?: TypeMode,
    originalSmartSheetType?: string
  ): string {
    // Handle SmartSheet type mode
    if (typeMode === 'smartsheet' && originalSmartSheetType) {
      return originalSmartSheetType; // Return original SmartSheet type
    }

    // Handle Airtable type mode
    if (typeMode === 'airtable' || useAirtableTypes) {
      return airtableType; // Directly return Airtable's type
    }

    // Handle DBML standard mode (default)
    const mapping: Record<string, string> = {
      singleLineText: 'varchar',
      multilineText: 'text',
      number: 'float',
      currency: 'decimal',
      percent: 'float',
      date: 'date',
      multipleRecordLinks: 'int',
      multipleSelects: 'varchar',
      singleSelect: 'varchar',
      formula: 'varchar',
      rollup: 'varchar',
      autoNumber: 'int',
      checkbox: 'boolean',
      email: 'varchar',
      url: 'varchar',
      phoneNumber: 'varchar',
      attachment: 'varchar',
      richText: 'text',
    };
    return mapping[airtableType] || 'varchar';
  }

  /**
   * Sanitizes a string for use in DBML notes by handling problematic characters.
   * @param text The text to sanitize.
   * @returns The sanitized text.
   */
  private sanitizeForDbml(text: string): string {
    if (!text) return '';
    
    // 1. Replace newlines and carriage returns with spaces
    let sanitized = text.replace(/[\r\n]+/g, ' ');
    
    // 2. Remove any problematic characters for DBML
    sanitized = sanitized.replace(/["\[\]{}\\]/g, '');
    
    // 3. Replace single quotes with escaped single quotes ('' instead of ')
    sanitized = sanitized.replace(/'/g, "");
    
    // 4. Replace multiple spaces with a single space
    sanitized = sanitized.replace(/\s+/g, ' ');
    
    // 5. Trim the result
    return sanitized.trim();
  }

  /**
   * Generates a business description without using LLM based on the specified strategy.
   * @param name The name of the field or table
   * @param type The type of the field (for fields only)
   * @param strategy The strategy to use for description generation
   * @param isTable Whether this is for a table (true) or field (false)
   * @returns The generated business description
   */
  private generateBusinessDescriptionWithoutLLM(
    name: string, 
    type?: string, 
    strategy: BusinessDescriptionStrategy = BusinessDescriptionStrategy.HYBRID,
    isTable: boolean = false
  ): string {
    const cleanName = this.cleanFieldName(name);
    
    switch (strategy) {
      case BusinessDescriptionStrategy.TECHNICAL_SIMPLE:
        return isTable ? `${cleanName} table` : `${cleanName} field`;
        
      case BusinessDescriptionStrategy.TYPE_BASED:
        if (isTable) {
          return `Table for managing ${cleanName.toLowerCase()} information`;
        }
        return this.getTypeBasedDescription(type || 'unknown', cleanName);
        
      case BusinessDescriptionStrategy.HYBRID:
      default:
        if (isTable) {
          return `${cleanName} - Table for managing ${cleanName.toLowerCase()} information`;
        }
        const typeDesc = this.getTypeBasedDescription(type || 'unknown', cleanName);
        return `${cleanName} - ${typeDesc}`;
    }
  }

  /**
   * Gets a type-based description for a field.
   * @param type The Airtable field type
   * @param fieldName The name of the field
   * @returns A description based on the field type
   */
  private getTypeBasedDescription(type: string, fieldName: string): string {
    const typeDescriptions: Record<string, string> = {
      'singleLineText': 'Text field for storing single line data',
      'multilineText': 'Text field for storing multi-line content',
      'number': 'Numeric field for calculations and measurements',
      'date': 'Date field for temporal information',
      'dateTime': 'Date and time field for precise temporal data',
      'singleSelect': 'Selection field with predefined options',
      'multipleSelects': 'Multi-selection field with predefined options',
      'singleRecordLink': 'Link field connecting to a single record',
      'multipleRecordLinks': 'Link field connecting to multiple records',
      'email': 'Email address field for contact information',
      'url': 'URL field for web links',
      'phoneNumber': 'Phone number field for contact details',
      'checkbox': 'Boolean field for true/false values',
      'rating': 'Rating field for numerical assessments',
      'currency': 'Currency field for monetary values',
      'percent': 'Percentage field for proportional values',
      'duration': 'Duration field for time periods',
      'rollup': 'Calculated field aggregating linked data',
      'formula': 'Formula field with computed values',
      'lookup': 'Lookup field retrieving data from linked records',
      'count': 'Count field for numerical totals',
      'autoNumber': 'Auto-incrementing number field',
      'barcode': 'Barcode field for product identification',
      'button': 'Button field for user interactions',
      'createdTime': 'System field recording creation timestamp',
      'lastModifiedTime': 'System field recording last modification',
      'createdBy': 'System field recording creator information',
      'lastModifiedBy': 'System field recording last modifier'
    };

    return typeDescriptions[type] || `Field for storing ${fieldName.toLowerCase()} data`;
  }

  /**
   * Formats the note for a field, including both business and technical descriptions.
   * @param field The field object.
   * @param tableMapping The mapping of table IDs to their metadata.
   * @param geminiConfig Configuration for Gemini AI.
   * @param useAirtableTypes Whether to use Airtable field types.
   * @returns The formatted note string.
   */
  private async formatFieldNote(
    field: any, 
    tableMapping: Record<string, any>,
    geminiConfig?: any,
    useAirtableTypes?: boolean
  ): Promise<string> {
    const fieldType = field.type || 'unknown';
    const fieldId = field.id || 'unknown';
    const options = field.options || {};
    let technicalNote = `Type: ${fieldType}`;
    
    // Variables para información de relación
    let isRelationship = false;
    let relatedTableName = '';

    if (fieldType === 'formula') {
      // Add SmartSheet formula to technical description if available
      const smartsheetFormula = options.smartsheetFormula;
      if (smartsheetFormula) {
        technicalNote += `, SmartSheet Formula: ${smartsheetFormula}`;
      }
    } else if (fieldType === 'currency') {
      const precision = options.precision || 'N/A';
      const symbol = options.symbol || 'N/A';
      technicalNote += `, Precision: ${precision}, Symbol: ${symbol}`;
    } else if (fieldType === 'date') {
      const dateFormat = options.dateFormat?.format || 'N/A';
      technicalNote += `, Format: ${dateFormat}`;
    } else if (fieldType === 'multipleRecordLinks') {
      const linkedTableId = options.linkedTableId || 'unknown';
      relatedTableName = tableMapping[linkedTableId]?.name || linkedTableId;
      technicalNote += `, Reference to ${relatedTableName} table`;
      isRelationship = true;
    } else if (fieldType === 'singleSelect') {
      const choices = field.options?.choices || [];
      const choiceNames = choices.map((choice: any) => choice.name || 'Unknown');
      technicalNote += `, Options: ${choiceNames.join(', ')}`;
    } else if (fieldType === 'multipleSelects') {
      const choices = field.options?.choices || [];
      const choiceNames = choices.map((choice: any) => choice.name || 'Unknown');
      technicalNote += `, Options: ${choiceNames.join(', ')}`;
    }

    technicalNote += `, field ID: ${fieldId}`;

    // Add readonly field information if using Airtable types
    if (useAirtableTypes) {
      const isReadonly = this.isReadonlyField(field);
      technicalNote += `, readonly field: ${isReadonly}`;
    }

    // Get or generate business description
    let businessDesc = field.description || '';
    
    if (!businessDesc || (geminiConfig?.overwriteFieldDescriptions === true)) {
      // Check if LLM is disabled
      if (geminiConfig?.disableLLM === true) {
        const strategy = geminiConfig?.businessDescriptionStrategy || BusinessDescriptionStrategy.HYBRID;
        businessDesc = this.generateBusinessDescriptionWithoutLLM(field.name, field.type, strategy, false);
      } else {
        // Generate description using Gemini with special handling for relationships
        const modelName = geminiConfig?.model || 'gpt-4o-mini';
        
        if (isRelationship) {
          // Prompt especializado para campos de relación
          businessDesc = await this.generateRelationshipDescription(field.name, relatedTableName, modelName);
        } else {
          // Prompt normal para otros tipos de campos
          businessDesc = await this.geminiService.generateBusinessDescription(field.name, modelName, false);
        }
      }
    }

    // Sanitize descriptions for DBML
    businessDesc = this.sanitizeForDbml(businessDesc);
    technicalNote = this.sanitizeForDbml(technicalNote);

    return `business desc: ${businessDesc}, technical desc: ${technicalNote}`;
  }

  /**
   * Generates a specialized description for relationship fields.
   */
  private async generateRelationshipDescription(
    fieldName: string, 
    relatedTableName: string,
    modelName: string
  ): Promise<string> {
    try {
      // Creamos un prompt especializado para relaciones
      const relationshipPrompt = `Given the database field "${fieldName}" which is a relationship to the "${relatedTableName}" table, provide a clear and concise business description of this relationship. Focus on what this connection represents in a business context (e.g., linking orders to customers, associating employees with departments). Explain the relationship's purpose and what business value it provides. Keep the description under 100 characters and make it clear this is a relationship or connection.`;
      
      return await this.geminiService.generateContentWithPrompt(relationshipPrompt, modelName);
    } catch (error) {
      console.error(`Error generating relationship description for "${fieldName}":`, error);
      return `Links to ${relatedTableName} records`;
    }
  }

  /**
   * Generates relationships between tables based on linked fields.
   * @param jsonGlobal The global JSON data.
   * @param tableMapping The mapping of table IDs to their metadata.
   * @returns An array of relationship strings in DBML format.
   */
  private generateRelationships(jsonGlobal: any, tableMapping: Record<string, any>): string[] {
    const relationships: string[] = [];
    const processedRelationships = new Set(); // To avoid duplicates
    
    jsonGlobal.tables.forEach((table: any) => {
      const currentTableName = this.cleanFieldName(table.name);
      
      table.fields.forEach((field: any) => {
        if (field.type === 'multipleRecordLinks') {
          const linkedTableId = field.options.linkedTableId;
          const inverseLinkFieldId = field.options.inverseLinkFieldId;
          const prefersSingleRecordLink = field.options.prefersSingleRecordLink || false;
          
          // Find related table and field
          const linkedTable = jsonGlobal.tables.find((t: any) => t.id === linkedTableId);
          if (!linkedTable) return;
          
          const linkedTableName = this.cleanFieldName(linkedTable.name);
          const fieldName = this.cleanFieldName(field.name);
          
          // Find the inverse field in the related table
          const inverseField = linkedTable.fields.find((f: any) => f.id === inverseLinkFieldId);
          if (!inverseField) return;
          
          const inverseFieldName = this.cleanFieldName(inverseField.name);
          const inversePrefersSingleRecordLink = inverseField.options.prefersSingleRecordLink || false;
          
          // Create a unique ID for this relationship to avoid duplicates
          const relationId = [table.id, field.id, linkedTable.id, inverseLinkFieldId].sort().join('_');
          if (processedRelationships.has(relationId)) return;
          processedRelationships.add(relationId);
          
          // Determine the relationship type based on prefersSingleRecordLink values
          let relationSymbol = '';
          if (prefersSingleRecordLink && inversePrefersSingleRecordLink) {
            // 1:1 relationship
            relationSymbol = '-';
          } else if (prefersSingleRecordLink && !inversePrefersSingleRecordLink) {
            // N:1 relationship (current table is the "1" side, linked table is "N")
            relationSymbol = '>';
          } else if (!prefersSingleRecordLink && inversePrefersSingleRecordLink) {
            // 1:N relationship (current table is the "N" side, linked table is "1")
            relationSymbol = '<';
          } else {
            // N:N relationship (neither side is "1")
            relationSymbol = '<>';
          }
          
          relationships.push(
            `Ref: ${currentTableName}.${fieldName} ${relationSymbol} ${linkedTableName}.${inverseFieldName}`
          );
        }
      });
    });
    
    return relationships;
  }

  /**
   * Generates a business description for a table.
   * @param table The table object.
   * @param geminiConfig Configuration for Gemini AI.
   * @returns The business description for the table.
   */
  private async generateTableBusinessDescription(table: any, geminiConfig?: any): Promise<string> {
    let description = '';
    
    if (table.description && geminiConfig?.overwriteTableDescriptions !== true) {
      description = table.description;
    } else {
      // Check if LLM is disabled
      if (geminiConfig?.disableLLM === true) {
        const strategy = geminiConfig?.businessDescriptionStrategy || BusinessDescriptionStrategy.HYBRID;
        description = this.generateBusinessDescriptionWithoutLLM(table.name, undefined, strategy, true);
      } else {
        const modelName = geminiConfig?.model || 'gpt-4o-mini';
        description = await this.geminiService.generateBusinessDescription(table.name, modelName, true);
      }
    }
    
    // Sanitize description for DBML
    return this.sanitizeForDbml(description);
  }

  /**
   * Processes the JSON input and generates the corresponding DBML.
   * @param jsonGlobal The global JSON object.
   * @param useAirtableTypes Whether to use Airtable field types or map them to DBML types.
   * @returns The generated DBML as a string.
   */
  public async processJsonToDbml(jsonGlobal: any, useAirtableTypes = false): Promise<string> {
    const geminiConfig = jsonGlobal.geminiConfig || {
      model: 'gpt-4o-mini',
      overwriteFieldDescriptions: false,
      overwriteTableDescriptions: false,
    };

    const tableMapping = jsonGlobal.tables.reduce((acc: Record<string, any>, table: any) => {
      acc[table.id] = {
        name: this.cleanFieldName(table.name),
        primaryFieldName: table.fields.find((field: any) => field.id === table.primaryFieldId)?.name || 'unknown_field',
      };
      return acc;
    }, {});

    let dbml = '';
    
    // Procesar cada tabla
    for (const table of jsonGlobal.tables) {
      const tableName = this.cleanFieldName(table.name);
      dbml += `Table ${tableName} {\n`;
      
      // Procesar cada campo
      for (const field of table.fields) {
        const fieldName = this.cleanFieldName(field.name);
        const originalSmartSheetType = field.options?.originalSmartSheetType;
        const fieldType = this.mapFieldType(field.type, useAirtableTypes, undefined, originalSmartSheetType);
        const note = await this.formatFieldNote(field, tableMapping, geminiConfig, useAirtableTypes);
        dbml += `    ${fieldName} ${fieldType} [note: '${note}']\n`;
      }
      
      // Generar la descripción de negocio para la tabla
      const businessDesc = await this.generateTableBusinessDescription(table, geminiConfig);
      
      // Build enhanced technical description with path and original name
      let techDesc = `### ${tableName} Table (airtable id: ${table.id})`;
      
      // Add original sheet name if available
      if (table.originalSheetName) {
        techDesc += `\nOriginal Sheet Name: ${table.originalSheetName}`;
      }
      
      // Add path if available
      if (table.path) {
        techDesc += `\nPath: ${table.path}`;
      }
      
      const sanitizedTechDesc = this.sanitizeForDbml(techDesc);
      const sanitizedBusinessDesc = this.sanitizeForDbml(businessDesc);
      dbml += `    note: '${sanitizedTechDesc} - ${sanitizedBusinessDesc}'\n`;
      dbml += '}\n\n';
    }

    const relationships = this.generateRelationships(jsonGlobal, tableMapping);
    dbml += relationships.join('\n');
    return dbml;
  }

  public async processJsonToDbmlWithProgress(
    jsonGlobal: any, 
    useAirtableTypes = false,
    progressCallback?: (currentItem: number, itemType: string, name: string) => void,
    typeMode?: TypeMode,
    getOriginalSmartSheetType?: (field: any) => string | undefined
  ): Promise<string> {
    const geminiConfig = jsonGlobal.geminiConfig || {
      model: 'gpt-4o-mini',
      overwriteFieldDescriptions: false,
      overwriteTableDescriptions: false,
    };

    const tableMapping = jsonGlobal.tables.reduce((acc: Record<string, any>, table: any) => {
      acc[table.id] = {
        name: this.cleanFieldName(table.name),
        primaryFieldName: table.fields.find((field: any) => field.id === table.primaryFieldId)?.name || 'unknown_field',
      };
      return acc;
    }, {});

    let dbml = '';
    
    // Procesar cada tabla
    let tableIndex = 0;
    for (const table of jsonGlobal.tables) {
      // Notificar progreso si se proporcionó un callback
      if (progressCallback) {
        progressCallback(tableIndex, 'table', table.name);
      }
      tableIndex++;
      
      const tableName = this.cleanFieldName(table.name);
      dbml += `Table ${tableName} {\n`;
      
      // Procesar cada campo
      let fieldIndex = 0;
      for (const field of table.fields) {
        // Notificar progreso para cada campo
        if (progressCallback) {
          progressCallback(fieldIndex, 'field', field.name);
        }
        fieldIndex++;
        
        const fieldName = this.cleanFieldName(field.name);
        const fieldType = this.mapFieldType(field.type, useAirtableTypes);
        const note = await this.formatFieldNote(field, tableMapping, geminiConfig, useAirtableTypes);
        dbml += `    ${fieldName} ${fieldType} [note: '${note}']\n`;
      }
      
      // Generar la descripción de negocio para la tabla
      const businessDesc = await this.generateTableBusinessDescription(table, geminiConfig);
      
      // Build enhanced technical description with path and original name
      let techDesc = `### ${tableName} Table (airtable id: ${table.id})`;
      
      // Add original sheet name if available
      if (table.originalSheetName) {
        techDesc += `\nOriginal Sheet Name: ${table.originalSheetName}`;
      }
      
      // Add path if available
      if (table.path) {
        techDesc += `\nPath: ${table.path}`;
      }
      
      const sanitizedTechDesc = this.sanitizeForDbml(techDesc);
      const sanitizedBusinessDesc = this.sanitizeForDbml(businessDesc);
      dbml += `    note: '${sanitizedTechDesc} - ${sanitizedBusinessDesc}'\n`;
      dbml += '}\n\n';
    }

    const relationships = this.generateRelationships(jsonGlobal, tableMapping);
    dbml += relationships.join('\n');
    return dbml;
  }
}
