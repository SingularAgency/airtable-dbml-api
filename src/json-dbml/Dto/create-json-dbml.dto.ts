import { ApiProperty } from '@nestjs/swagger';

// Enum for business description strategies when LLM is disabled
export enum BusinessDescriptionStrategy {
  TECHNICAL_SIMPLE = 'technical_simple',
  TYPE_BASED = 'type_based', 
  HYBRID = 'hybrid'
}

class FieldOptions {
  @ApiProperty({ example: 'tbl123ABC', description: 'ID of the linked table (if applicable)' })
  linkedTableId?: string;

  @ApiProperty({ example: 'singleSelect', description: 'Type of options for the field (e.g., singleSelect, multipleSelects)' })
  resultType?: string;

  @ApiProperty({ example: ['Option 1', 'Option 2'], description: 'Choices available for the field' })
  choices?: string[];
}

class Field {
  @ApiProperty({ example: 'fld123XYZ', description: 'Unique ID of the field' })
  id: string;

  @ApiProperty({ example: 'singleLineText', description: 'Type of the field (e.g., singleLineText, date, number)' })
  type: string;

  @ApiProperty({ example: 'Name', description: 'Name of the field' })
  name: string;

  @ApiProperty({ type: FieldOptions, description: 'Additional options or metadata for the field' })
  options?: FieldOptions;
  
  @ApiProperty({ example: 'This field stores the employee name', required: false, description: 'Business description of the field' })
  description?: string;
}

class Table {
  @ApiProperty({ example: 'tbl123ABC', description: 'Unique ID of the table' })
  id: string;

  @ApiProperty({ example: 'Employees', description: 'Name of the table' })
  name: string;

  @ApiProperty({ example: 'fld123XYZ', description: 'ID of the primary field for the table' })
  primaryFieldId: string;

  @ApiProperty({ type: [Field], description: 'List of fields contained in the table' })
  fields: Field[];
  
  @ApiProperty({ example: 'This table stores employee information', required: false, description: 'Business description of the table' })
  description?: string;
}

class GeminiConfig {
  @ApiProperty({ 
    example: 'gpt-4o-mini', 
    default: 'gpt-4o-mini', 
    required: false, 
    description: 'Gemini AI model to use for generating descriptions' 
  })
  model?: string;

  @ApiProperty({ 
    example: false, 
    default: false, 
    required: false, 
    description: 'Whether to overwrite existing field descriptions with AI-generated ones' 
  })
  overwriteFieldDescriptions?: boolean;

  @ApiProperty({ 
    example: false, 
    default: false, 
    required: false, 
    description: 'Whether to overwrite existing table descriptions with AI-generated ones' 
  })
  overwriteTableDescriptions?: boolean;

  @ApiProperty({ 
    example: false, 
    default: false, 
    required: false, 
    description: 'Disable LLM usage for business descriptions. When true, uses predefined strategies instead of AI generation' 
  })
  disableLLM?: boolean;

  @ApiProperty({ 
    enum: BusinessDescriptionStrategy,
    example: BusinessDescriptionStrategy.HYBRID,
    default: BusinessDescriptionStrategy.HYBRID,
    required: false, 
    description: 'Strategy to use for business descriptions when LLM is disabled. Options: technical_simple (just name), type_based (based on field type), hybrid (name + type info)' 
  })
  businessDescriptionStrategy?: BusinessDescriptionStrategy;
}

export class CreateJsonDbmlDto {
  @ApiProperty({ type: [Table], description: 'List of tables present in the global JSON object' })
  tables: Table[];
  
  @ApiProperty({ 
    type: GeminiConfig, 
    required: false, 
    description: 'Configuration for Gemini AI',
    default: {
      model: 'gpt-4o-mini',
      overwriteFieldDescriptions: false,
      overwriteTableDescriptions: false
    }
  })
  geminiConfig?: GeminiConfig;
}
