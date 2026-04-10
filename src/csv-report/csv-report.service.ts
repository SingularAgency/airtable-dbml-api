import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as Papa from 'papaparse';
import { JobService } from '../job/job.service';
import { GeminiService } from '../gemini/gemini.service';

// Basic representation of Airtable schema structures
// These can be expanded if more details are needed
interface AirtableField {
  id: string;
  name: string;
  type: string;
  options?: any;
  description?: string;
}

interface AirtableTable {
  id: string;
  name: string;
  primaryFieldId?: string;
  fields: AirtableField[];
}

interface AirtableSchema {
  tables: AirtableTable[];
}

interface CsvRow {
  'Table Name': string;
  'Is Primary Field': string;
  'Link Type': string;
  'Field Name': string;
  'Field ID': string;
  'Field Type': string;
  'Source Fields (for Lookups/Rollups)': string;
  'Formula (if applicable)': string;
  'Formula Dependencies': string;
  'Used By (count)': number;
  'Referenced By': string;
  'Description': string;
  'Notes': string;
}

@Injectable()
export class CsvReportService {
  private readonly logger = new Logger(CsvReportService.name);

  constructor(
    private readonly jobService: JobService,
    private readonly geminiService: GeminiService,
  ) {}

  async generateReport(
    sourceJobId: string,
    updateProgress: (progress: number, description?: string) => void,
    generateDescriptions: boolean = false,
  ): Promise<string> {
    this.logger.log(`Starting CSV report generation from source job: ${sourceJobId}`);
    updateProgress(10, `Fetching source job ${sourceJobId}`);

    const sourceJob = this.jobService.getJob(sourceJobId);
    if (!sourceJob) {
      throw new NotFoundException(`Source job with ID ${sourceJobId} not found.`);
    }
    if (sourceJob.status !== 'completed') {
      throw new BadRequestException(`Source job ${sourceJobId} is not completed. Current status: ${sourceJob.status}`);
    }
    if (sourceJob.jobType !== 'schema-extraction') {
        throw new BadRequestException(`Source job ${sourceJobId} is not a 'schema-extraction' job. Job type: ${sourceJob.jobType}`);
    }

    const schemaPath = this.jobService.getJobResultPath(sourceJobId);
    if (!schemaPath) {
      throw new NotFoundException(`Result file for job ${sourceJobId} not found.`);
    }

    updateProgress(20, 'Reading schema file');
    const schemaContent = await fs.readFile(schemaPath, 'utf-8');
    const schema: AirtableSchema = JSON.parse(schemaContent);

    // Use the common processing logic
    return this.processSchemaToCsv(schema, updateProgress, generateDescriptions, 20);
  }

  async generateReportFromFile(
    fileContent: string,
    updateProgress: (progress: number, description?: string) => void,
    generateDescriptions: boolean = false,
  ): Promise<string> {
    this.logger.log(`Starting CSV report generation from file content.`);
    updateProgress(10, `Parsing schema file`);

    try {
        const schema: AirtableSchema = JSON.parse(fileContent);
        
        // Use the common processing logic
        return this.processSchemaToCsv(schema, updateProgress, generateDescriptions, 10);
    } catch (error) {
        this.logger.error('Failed to parse or process the provided file.', error.stack);
        throw new BadRequestException('Invalid file content. The file must be a valid JSON schema exported from Airtable.');
    }
  }

  /**
   * Common processing logic for converting Airtable schema to CSV.
   * This method is used by both generateReport (from job) and generateReportFromFile (from file upload).
   * @param schema The parsed Airtable schema
   * @param updateProgress Progress callback function
   * @param generateDescriptions Whether to generate AI descriptions for fields
   * @param initialProgress Starting progress value (10 for file, 20 for job)
   * @returns The generated CSV string
   */
  private async processSchemaToCsv(
    schema: AirtableSchema,
    updateProgress: (progress: number, description?: string) => void,
    generateDescriptions: boolean = false,
    initialProgress: number = 10,
  ): Promise<string> {
    this.logger.log('Calculating field usage counts...');
    updateProgress(initialProgress + 20, 'Calculating field usage');
    const { usageMap, fieldIdToNameMap, fieldIdToFieldMap } = this.calculateFieldUsage(schema);

    this.logger.log('Generating CSV rows...');
    updateProgress(initialProgress + 50, 'Generating CSV rows');
    const csvData: CsvRow[] = [];

    const totalFields = schema.tables.reduce((sum, table) => sum + table.fields.length, 0);
    let processedFields = 0;

    for (const table of schema.tables) {
      for (const field of table.fields) {
        const references = this.getReferencesForField(field, usageMap, fieldIdToNameMap, fieldIdToFieldMap);
        
        // Generate description if requested
        let description = '';
        if (generateDescriptions) {
          const descriptionProgress = initialProgress + 50 + Math.floor((processedFields / totalFields) * 20);
          updateProgress(descriptionProgress, `Generating description for ${table.name}.${field.name}`);
          description = await this.generateFieldDescription(field, table, schema);
        }

        csvData.push({
          'Table Name': table.name,
          'Is Primary Field': this.isPrimaryField(field, table),
          'Link Type': this.getLinkType(field),
          'Field Name': field.name,
          'Field ID': field.id,
          'Field Type': field.type,
          'Source Fields (for Lookups/Rollups)': this.formatSourceFields(field, fieldIdToNameMap),
          'Formula (if applicable)': this.formatFormula(field, fieldIdToNameMap),
          'Formula Dependencies': this.formatFormulaDependencies(field, fieldIdToNameMap),
          'Used By (count)': references.length,
          'Referenced By': references.join(', '),
          'Description': description,
          'Notes': this.generateNotes(field),
        });
        
        processedFields++;
      }
    }

    this.logger.log('Converting data to CSV format...');
    updateProgress(initialProgress + 80, 'Finalizing CSV file');
    const csvString = Papa.unparse(csvData);

    this.logger.log('CSV report generation finished.');
    updateProgress(100, 'Report generated successfully');
    
    return csvString;
  }

  private getReferencesForField(
      field: AirtableField, 
      usageMap: Record<string, string[]>, 
      fieldIdToNameMap: Record<string, string>, 
      fieldIdToFieldMap: Record<string, AirtableField & { tableName: string }>
  ): string[] {
    const options = field.options;

    // For a linked record, we want to show the "other side" of the link.
    if (field.type === 'multipleRecordLinks' && options?.inverseLinkFieldId) {
        const inverseFieldName = fieldIdToNameMap[options.inverseLinkFieldId];
        return inverseFieldName ? [inverseFieldName] : ['Broken Inverse Link'];
    }

    // For a lookup, we want to show what fields it depends on.
    if ((field.type === 'lookup' || field.type === 'multipleLookupValues') && options) {
        const refs: string[] = [];
        if (options.recordLinkFieldId) {
            const name = fieldIdToNameMap[options.recordLinkFieldId];
            if (name) refs.push(name);
        }
        if (options.fieldIdInLinkedTable) {
            const name = fieldIdToNameMap[options.fieldIdInLinkedTable];
            if (name) refs.push(name);
        }
        return refs;
    }

    // For all other fields (formulas, rollups, etc.), show what other fields use them.
    return usageMap[field.id] || [];
  }

  private calculateFieldUsage(schema: AirtableSchema): {
    usageMap: Record<string, string[]>,
    fieldIdToNameMap: Record<string, string>,
    fieldIdToFieldMap: Record<string, AirtableField & { tableName: string }>
  } {
    const usageMap: Record<string, string[]> = {};
    const fieldIdToNameMap: Record<string, string> = {};
    const fieldIdToFieldMap: Record<string, AirtableField & { tableName: string }> = {};

    // First pass: initialize all maps
    for (const table of schema.tables) {
      for (const field of table.fields) {
        usageMap[field.id] = [];
        const fullFieldName = `${table.name}.${field.name}`;
        fieldIdToNameMap[field.id] = fullFieldName;
        fieldIdToFieldMap[field.id] = { ...field, tableName: table.name };
      }
    }

    // Second pass: populate the usageMap
    for (const fieldId in fieldIdToFieldMap) {
      const referencingField = fieldIdToFieldMap[fieldId];
      const options = referencingField.options;
      if (!options) continue;

      const referencingFieldName = fieldIdToNameMap[fieldId];
      let referencedFieldIds = new Set<string>();

      // A. Formula dependencies
      if (referencingField.type === 'formula' && options.formula) {
        const formula: string = options.formula;
        (formula.match(/fld[a-zA-Z0-9]{14}/g) || []).forEach(id => referencedFieldIds.add(id));
      }

      // B. Lookup/Rollup dependencies
      const isLookupOrRollup = ['lookup', 'multipleLookupValues', 'rollup'].includes(referencingField.type);
      if (isLookupOrRollup && options) {
        if (options.recordLinkFieldId) {
          referencedFieldIds.add(options.recordLinkFieldId);
        }
        if (options.fieldIdInLinkedTable) {
          referencedFieldIds.add(options.fieldIdInLinkedTable);
        }
      }

      // C. Count dependencies
      if (referencingField.type === 'count' && options.recordLinkFieldId) {
        referencedFieldIds.add(options.recordLinkFieldId);
      }

      // Populate the map (avoid duplicates)
      for (const referencedId of referencedFieldIds) {
        if (usageMap.hasOwnProperty(referencedId) && referencedId !== referencingField.id) {
          // Only add if not already in the array to avoid duplicates
          if (!usageMap[referencedId].includes(referencingFieldName)) {
            usageMap[referencedId].push(referencingFieldName);
          }
        }
      }
    }

    return { usageMap, fieldIdToNameMap, fieldIdToFieldMap };
  }

  private formatSourceFields(field: AirtableField, idToName: Record<string, string>): string {
    const options = field.options;
    if (!options) return '';

    const isLookup = ['lookup', 'multipleLookupValues'].includes(field.type);

    if (isLookup && options.fieldIdInLinkedTable && options.recordLinkFieldId) {
      const linkedRecordField = idToName[options.recordLinkFieldId] || `(ID: ${options.recordLinkFieldId})`;
      const targetField = idToName[options.fieldIdInLinkedTable] || `(ID: ${options.fieldIdInLinkedTable})`;
      return `LOOKUP via [${linkedRecordField}] on field [${targetField}]`;
    }

    if (field.type === 'rollup' && options.fieldIdInLinkedTable && options.recordLinkFieldId) {
      const linkedRecordField = idToName[options.recordLinkFieldId] || `(ID: ${options.recordLinkFieldId})`;
      const targetField = idToName[options.fieldIdInLinkedTable] || `(ID: ${options.fieldIdInLinkedTable})`;
      const aggregationFunc = this.getRollupAggregationFunction(field);
      if (aggregationFunc) {
        return `ROLLUP via [${linkedRecordField}] on field [${targetField}] using ${aggregationFunc}`;
      } else {
        // If aggregation function is not available, show result type as fallback
        const resultType = options.result?.type || 'UNKNOWN';
        return `ROLLUP via [${linkedRecordField}] on field [${targetField}] (result type: ${resultType.toUpperCase()}, aggregation function not available in schema)`;
      }
    }

    // If it's a lookup/rollup type but didn't match above, the link is broken.
    if (isLookup || field.type === 'rollup') {
        return 'Broken Link';
    }

    return '';
  }

  private formatFormulaDependencies(field: AirtableField, idToName: Record<string, string>): string {
    if (field.type !== 'formula' || !field.options?.formula) {
      return '';
    }

    const formula: string = field.options.formula;
    const referencedFieldIds = formula.match(/fld[a-zA-Z0-9]{14}/g) || [];
    
    const dependencyNames = new Set(
      referencedFieldIds.map(id => idToName[id] || `(Unknown ID: ${id})`)
    );

    return Array.from(dependencyNames).join(', ');
  }


  private formatFormula(field: AirtableField, idToName: Record<string, string>): string {
    if (field.type !== 'formula' || !field.options?.formula) {
      return '';
    }
    
    let formula: string = field.options.formula;
    // Replace field IDs with {TableName.FieldName}
    const fieldIds = formula.match(/fld[a-zA-Z0-9]{14}/g) || [];
    for (const fieldId of new Set(fieldIds)) {
      const fieldName = idToName[fieldId] || `(Unknown Field: ${fieldId})`;
      // Use a regex with global flag to replace all occurrences
      formula = formula.replace(new RegExp(fieldId, 'g'), `{${fieldName}}`);
    }

    return formula;
  }

  private isPrimaryField(field: AirtableField, table: AirtableTable): string {
    return table.primaryFieldId === field.id ? 'Yes' : 'No';
  }

  private getLinkType(field: AirtableField): string {
    if (field.type === 'multipleRecordLinks' && field.options) {
      const prefersSingle = field.options.prefersSingleRecordLink;
      return prefersSingle === true ? 'Single' : 'Multiple';
    }
    return '';
  }

  private getRollupAggregationFunction(field: AirtableField): string {
    if (field.type !== 'rollup' || !field.options) {
      return '';
    }

    const options = field.options;

    // Try to find aggregation function in different possible locations
    // Option 1: Direct aggregation property
    if (options.aggregation) {
      return options.aggregation.toUpperCase();
    }

    // Option 2: In result.aggregation
    if (options.result?.aggregation) {
      return options.result.aggregation.toUpperCase();
    }

    // Option 3: In formula property (some rollups store it as a formula)
    if (options.formula) {
      // Extract function name from formula like "MIN(values)", "MAX(values)", etc.
      const formulaMatch = options.formula.match(/^(\w+)\(/);
      if (formulaMatch) {
        return formulaMatch[1].toUpperCase();
      }
    }

    // Option 4: Check if there's a function property
    if (options.function) {
      return options.function.toUpperCase();
    }

    // Option 5: Check for aggregationFormula property
    if (options.aggregationFormula) {
      const formulaMatch = options.aggregationFormula.match(/^(\w+)\(/);
      if (formulaMatch) {
        return formulaMatch[1].toUpperCase();
      }
    }

    // Note: The aggregation function (MIN, MAX, SUM, etc.) is not available
    // in the exported schema JSON. The Airtable API metadata endpoint may not
    // expose this information directly. We return empty string to indicate
    // that this information is not available in the schema.
    return '';
  }

  private generateNotes(field: AirtableField): string {
    const notes: string[] = [];
    if (field.type === 'multipleRecordLinks' && field.options?.linkedTableName) {
      notes.push(`Links to table [${field.options.linkedTableName}]`);
      if (field.options.isReversed) {
        notes.push('This is a reversed link (computed).');
      }
    }
    if (field.description) {
      // clean up newlines to not break CSV
      const cleanedDescription = field.description.replace(/(\r\n|\n|\r)/gm, " ");
      notes.push(`Description: "${cleanedDescription}"`);
    }

    return notes.join(' | ');
  }

  /**
   * Generates a business description for a field.
   * If field.description exists, uses it directly (does not regenerate).
   * If not, generates using AI with fallback to default description.
   * @param field The field to generate description for
   * @param table The table containing the field
   * @param schema The full schema (for context)
   * @returns The field description
   */
  private async generateFieldDescription(
    field: AirtableField,
    table: AirtableTable,
    schema: AirtableSchema,
  ): Promise<string> {
    // If description already exists, use it directly (do not regenerate)
    if (field.description) {
      return field.description;
    }

    try {
      // Check if it's a relationship field
      const isRelationship = field.type === 'multipleRecordLinks' || field.type === 'singleRecordLink';
      let relatedTableName = '';

      if (isRelationship && field.options?.linkedTableId) {
        const linkedTable = schema.tables.find(t => t.id === field.options.linkedTableId);
        if (linkedTable) {
          relatedTableName = linkedTable.name;
        }
      }

      // Use the same model configuration as json-dbml (default: 'gpt-4o-mini')
      const modelName = 'gpt-4o-mini';

      if (isRelationship && relatedTableName) {
        // Generate specialized description for relationship fields
        const relationshipPrompt = `Given the database field "${field.name}" which is a relationship to the "${relatedTableName}" table, provide a clear and concise business description of this relationship. Focus on what this connection represents in a business context (e.g., linking orders to customers, associating employees with departments). Explain the relationship's purpose and what business value it provides. Keep the description under 100 characters and make it clear this is a relationship or connection.`;
        
        return await this.geminiService.generateContentWithPrompt(relationshipPrompt, modelName);
      } else {
        // Generate normal business description
        return await this.geminiService.generateBusinessDescription(field.name, modelName, false);
      }
    } catch (error) {
      this.logger.warn(`Failed to generate description for field ${table.name}.${field.name}: ${error.message}`);
      // Return default description on failure
      return this.getDefaultFieldDescription(field.name, field.type);
    }
  }

  /**
   * Returns a default description for a field when AI generation fails.
   * @param fieldName The name of the field
   * @param fieldType The type of the field
   * @returns A default description
   */
  private getDefaultFieldDescription(fieldName: string, fieldType: string): string {
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

    const typeDesc = typeDescriptions[fieldType] || `Field for storing ${fieldName.toLowerCase()} data`;
    return `${fieldName} - ${typeDesc}`;
  }
}


