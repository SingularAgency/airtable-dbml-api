import { Injectable, Logger } from '@nestjs/common';
import { CreateJsonDbmlDto } from '../json-dbml/Dto/create-json-dbml.dto';
import { TypeMode } from '../json-dbml/json-dbml.service';
import { GeminiService } from '../gemini/gemini.service';

@Injectable()
export class SmartSheetDbmlService {
  private readonly logger = new Logger(SmartSheetDbmlService.name);

  constructor(private readonly geminiService: GeminiService) {}

  /**
   * Converts SmartSheet JSON format to Airtable-compatible format
   * @param smartsheetJson The SmartSheet JSON data
   * @param geminiConfig Optional Gemini configuration for AI descriptions
   * @returns Airtable-compatible JSON format
   */
  async convertSmartSheetToAirtableFormat(
    smartsheetJson: any,
    geminiConfig?: any,
  ): Promise<CreateJsonDbmlDto> {
    // Validate SmartSheet JSON structure
    if (!Array.isArray(smartsheetJson) || smartsheetJson.length === 0) {
      throw new Error('Invalid SmartSheet JSON: Expected array with at least one element');
    }

    const firstElement = smartsheetJson[0];
    
    // Handle both structures: direct data_dictionary or nested in json property
    let dataDictionary: any[];
    if (firstElement.json && firstElement.json.data_dictionary) {
      // New structure: [{ "json": { "data_dictionary": [...] } }]
      dataDictionary = firstElement.json.data_dictionary;
    } else if (firstElement.data_dictionary) {
      // Old structure: [{ "data_dictionary": [...] }]
      dataDictionary = firstElement.data_dictionary;
    } else {
      throw new Error('Invalid SmartSheet JSON: Missing or invalid data_dictionary array');
    }

    if (!Array.isArray(dataDictionary)) {
      throw new Error('Invalid SmartSheet JSON: data_dictionary must be an array');
    }

    const tablePromises = dataDictionary.map(async (sheet: any) => {
      if (!sheet.columns || !Array.isArray(sheet.columns) || sheet.columns.length === 0) {
        this.logger.warn(`Sheet ${sheet.sheet_name} has no columns, skipping`);
        return null;
      }

      // Convert sheet_id to string for table id
      const tableId = sheet.sheet_id.toString();
      
      // Use first column as primary field
      const primaryFieldId = sheet.columns[0].column_id.toString();

      // Map columns to fields (using Promise.all for async formula analysis)
      const fieldPromises = sheet.columns.map(async (column: any) => {
        const airtableType = this.mapSmartSheetTypeToAirtable(column);
        const validatedType = this.validateAndCorrectFieldType(column, airtableType);

        const field: any = {
          id: column.column_id.toString(),
          type: validatedType,
          name: column.title,
        };

        // Initialize options if not exists
        if (!field.options) {
          field.options = {};
        }

        // Store original SmartSheet type for type mode support
        field.options.originalSmartSheetType = column.smartsheet_type;

        // Store formula in options for technical_desc
        if (validatedType === 'formula' && column.column_formula) {
          field.options.smartsheetFormula = column.column_formula;
        }

        // Handle formula fields: generate AI analysis for business_desc
        if (validatedType === 'formula' && column.column_formula) {
          // Generate AI analysis of what the formula does
          const useAI = !geminiConfig?.disableLLM;
          if (useAI) {
            try {
              const modelName = geminiConfig?.model || 'gpt-4o-mini';
              const formulaAnalysis = await this.generateFormulaAnalysis(
                column.title,
                column.column_formula,
                modelName,
              );
              field.description = formulaAnalysis;
            } catch (error) {
              this.logger.warn(
                `Failed to generate formula analysis for ${column.title}: ${error.message}`,
              );
              // Fallback to existing business_desc or default
              field.description =
                column.business_desc && column.business_desc.trim() !== ''
                  ? column.business_desc
                  : `Calculated field: ${column.title}`;
            }
          } else {
            // Use existing business_desc or default
            field.description =
              column.business_desc && column.business_desc.trim() !== ''
                ? column.business_desc
                : `Calculated field: ${column.title}`;
          }
        } else {
          // For non-formula fields, use existing business_desc if available
          if (column.business_desc && column.business_desc.trim() !== '') {
            field.description = column.business_desc;
          }
        }

        // Add options for singleSelect and multipleSelects
        if (validatedType === 'singleSelect' || validatedType === 'multipleSelects') {
          if (
            column.select_options &&
            Array.isArray(column.select_options) &&
            column.select_options.length > 0
          ) {
            field.options.choices = column.select_options.map((opt: string) => ({
              name: opt,
            }));
          }
        }

        return field;
      });

      const fields = (await Promise.all(fieldPromises)).filter(
        (field: any) => field !== null,
      );

      // Use table_name if available (has unique suffix), otherwise use sheet_name
      // This prevents duplicate table names when multiple sheets have the same name
      // If table_name is not available, make name unique by appending sheet_id
      let tableName: string;
      if (sheet.table_name) {
        tableName = sheet.table_name;
      } else {
        // Make name unique by appending sheet_id to prevent duplicates
        const baseName = sheet.sheet_name || `Sheet_${tableId}`;
        tableName = `${baseName}_${tableId}`;
      }

      return {
        id: tableId,
        name: tableName,
        primaryFieldId: primaryFieldId,
        fields: fields,
        description: sheet.description || undefined,
        // Add original sheet name and path for table description
        originalSheetName: sheet.sheet_name,
        path: sheet.path || sheet.table_path || undefined,
      };
    });

    const tables = (await Promise.all(tablePromises)).filter(
      (table: any) => table !== null,
    );

    if (tables.length === 0) {
      throw new Error('No valid tables found in SmartSheet JSON');
    }

    return {
      tables: tables,
    };
  }

  /**
   * Maps SmartSheet column type to Airtable field type
   * @param column The SmartSheet column object
   * @returns Airtable field type
   */
  private mapSmartSheetTypeToAirtable(column: any): string {
    const smartsheetType = column.smartsheet_type;
    const isComputed = column.is_computed === true;
    const hasFormula = column.column_formula !== null && column.column_formula !== undefined;
    const selectOptions = column.select_options || [];
    const formulaReturnType = column.formula_return_type;

    // Handle TEXT_NUMBER type (most complex)
    if (smartsheetType === 'TEXT_NUMBER') {
      // Case 1: Simple text field
      if (!isComputed && !hasFormula) {
        return 'singleLineText';
      }

      // Case 2: Select field (has select_options)
      if (isComputed && selectOptions.length > 0) {
        return 'singleSelect';
      }

      // Case 3-5: Formula fields
      if (isComputed && hasFormula) {
        return 'formula';
      }

      // Default fallback for TEXT_NUMBER
      return 'singleLineText';
    }

    // Handle DATE type
    if (smartsheetType === 'DATE') {
      return 'date';
    }

    // Handle CHECKBOX type
    if (smartsheetType === 'CHECKBOX') {
      return 'checkbox';
    }

    // Handle PICKLIST type
    if (smartsheetType === 'PICKLIST') {
      return 'singleSelect';
    }

    // Handle CURRENCY type
    if (smartsheetType === 'CURRENCY') {
      return 'currency';
    }

    // Handle CONTACT_LIST type
    if (smartsheetType === 'CONTACT_LIST') {
      return 'singleLineText';
    }

    // Handle MULTI_CONTACT_LIST type
    if (smartsheetType === 'MULTI_CONTACT_LIST') {
      return 'multipleSelects';
    }

    // Default fallback
    this.logger.warn(`Unknown SmartSheet type: ${smartsheetType}, defaulting to singleLineText`);
    return 'singleLineText';
  }

  /**
   * Validates and corrects field type based on validation rules
   * @param column The SmartSheet column object
   * @param computedType The computed Airtable type
   * @returns Validated and corrected field type
   */
  private validateAndCorrectFieldType(column: any, computedType: string): string {
    const dbmlType = column.dbml_type;
    const selectOptions = column.select_options || [];
    const isComputed = column.is_computed === true;
    const smartsheetType = column.smartsheet_type;

    // Validation 1: singleSelect without options → singleLineText
    if (computedType === 'singleSelect' && selectOptions.length === 0) {
      this.logger.warn(
        `Column ${column.title}: singleSelect without options, changing to singleLineText`
      );
      return 'singleLineText';
    }

    // Validation 2: formula without is_computed → appropriate type
    if (computedType === 'formula' && !isComputed) {
      this.logger.warn(
        `Column ${column.title}: formula type but is_computed is false, changing based on smartsheet_type`
      );
      // Map based on smartsheet_type
      if (smartsheetType === 'DATE') return 'date';
      if (smartsheetType === 'CHECKBOX') return 'checkbox';
      if (smartsheetType === 'CURRENCY') return 'currency';
      return 'singleLineText';
    }

    // Validation 3: formula with null formula_return_type → default to text formula
    // This is handled in the mapping, but we ensure it's still formula type
    if (computedType === 'formula' && column.formula_return_type === null) {
      // Keep as formula, it will default to text
      return 'formula';
    }

    // Validation 4: dbml_type doesn't match computed type → use computed type
    if (dbmlType && dbmlType !== computedType) {
      this.logger.warn(
        `Column ${column.title}: dbml_type (${dbmlType}) doesn't match computed type (${computedType}), using computed type`
      );
    }

    return computedType;
  }

  /**
   * Maps Airtable field type to final DBML type based on type mode
   * @param airtableType The Airtable field type
   * @param typeMode The type mode (dbml, smartsheet, or airtable)
   * @param originalSmartSheetType The original SmartSheet type (for smartsheet mode)
   * @returns The final type to use in DBML
   */
  mapToDbmlType(
    airtableType: string,
    typeMode: TypeMode,
    originalSmartSheetType?: string
  ): string {
    if (typeMode === 'airtable') {
      // Return Airtable types directly
      return airtableType;
    }

    if (typeMode === 'smartsheet') {
      // Return original SmartSheet types
      if (originalSmartSheetType) {
        return originalSmartSheetType;
      }
      // Fallback: try to map back from Airtable type
      return this.mapAirtableToSmartSheetType(airtableType);
    }

    // typeMode === 'dbml': Map to DBML standard types
    return this.mapAirtableToDbmlStandard(airtableType);
  }

  /**
   * Maps Airtable types to DBML standard types
   * @param airtableType The Airtable field type
   * @returns DBML standard type
   */
  private mapAirtableToDbmlStandard(airtableType: string): string {
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
   * Maps Airtable types back to SmartSheet types (approximate)
   * @param airtableType The Airtable field type
   * @returns Approximate SmartSheet type
   */
  private mapAirtableToSmartSheetType(airtableType: string): string {
    const mapping: Record<string, string> = {
      singleLineText: 'TEXT_NUMBER',
      multilineText: 'TEXT_NUMBER',
      number: 'TEXT_NUMBER',
      currency: 'CURRENCY',
      date: 'DATE',
      checkbox: 'CHECKBOX',
      singleSelect: 'PICKLIST',
      multipleSelects: 'MULTI_CONTACT_LIST',
      formula: 'TEXT_NUMBER',
      email: 'TEXT_NUMBER',
      url: 'TEXT_NUMBER',
      phoneNumber: 'TEXT_NUMBER',
    };
    return mapping[airtableType] || 'TEXT_NUMBER';
  }

  /**
   * Generates AI analysis of what a SmartSheet formula does
   * @param fieldName The name of the field
   * @param formula The SmartSheet formula
   * @param modelName The AI model to use
   * @returns Analysis of what the formula does
   */
  private async generateFormulaAnalysis(
    fieldName: string,
    formula: string,
    modelName: string,
  ): Promise<string> {
    const prompt = `Analyze this SmartSheet formula and provide a brief business description (under 150 characters) of what it calculates or does:

Field Name: "${fieldName}"
Formula: ${formula}

Provide a clear, concise explanation of what this formula calculates or determines. Focus on the business purpose and result, not the technical implementation.`;

    try {
      return await this.geminiService.generateContentWithPrompt(prompt, modelName);
    } catch (error) {
      this.logger.error(
        `Error generating formula analysis for ${fieldName}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Validates SmartSheet JSON structure
   * @param smartsheetJson The JSON to validate
   * @throws Error if validation fails
   */
  validateSmartSheetJson(smartsheetJson: any): void {
    if (!Array.isArray(smartsheetJson) || smartsheetJson.length === 0) {
      throw new Error('Invalid SmartSheet JSON: Expected array with at least one element');
    }

    const firstElement = smartsheetJson[0];
    
    // Handle both structures: direct data_dictionary or nested in json property
    let dataDictionary: any[];
    if (firstElement.json && firstElement.json.data_dictionary) {
      // New structure: [{ "json": { "data_dictionary": [...] } }]
      dataDictionary = firstElement.json.data_dictionary;
    } else if (firstElement.data_dictionary) {
      // Old structure: [{ "data_dictionary": [...] }]
      dataDictionary = firstElement.data_dictionary;
    } else {
      throw new Error('Invalid SmartSheet JSON: Missing or invalid data_dictionary array');
    }

    if (!Array.isArray(dataDictionary)) {
      throw new Error('Invalid SmartSheet JSON: data_dictionary must be an array');
    }

    if (dataDictionary.length === 0) {
      throw new Error('Invalid SmartSheet JSON: data_dictionary array is empty');
    }

    // Validate each sheet has required fields
    for (const sheet of dataDictionary) {
      if (!sheet.sheet_id || !sheet.sheet_name) {
        throw new Error('Invalid SmartSheet JSON: Sheet missing sheet_id or sheet_name');
      }
      if (!sheet.columns || !Array.isArray(sheet.columns)) {
        throw new Error(`Invalid SmartSheet JSON: Sheet ${sheet.sheet_name} missing columns array`);
      }
    }
  }
}
