import { Controller, Post, Body, Res, Header, Query, HttpCode, Get } from '@nestjs/common';
import { ApiTags, ApiBody, ApiOperation, ApiResponse, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { JsonDbmlService } from './json-dbml.service';
import { CreateJsonDbmlDto, BusinessDescriptionStrategy } from './Dto/create-json-dbml.dto';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { JobService } from '../job/job.service';

@ApiTags('dbml')
@Controller('json-dbml')
export class JsonDbmlController {
  constructor(
    private readonly jsonDbmlService: JsonDbmlService,
    private readonly jobService: JobService
  ) {}

  @Get('llm-status')
  @ApiOperation({
    summary: 'Get LLM status and available business description strategies',
    description: 'Returns information about LLM availability and the different strategies available for business descriptions when LLM is disabled.'
  })
  @ApiResponse({
    status: 200,
    description: 'LLM status and strategies information',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            llmAvailable: { type: 'boolean', example: true },
            geminiApiKeyConfigured: { type: 'boolean', example: true },
            availableStrategies: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  value: { type: 'string', example: 'technical_simple' },
                  label: { type: 'string', example: 'Technical Simple' },
                  description: { type: 'string', example: 'Simple technical descriptions (e.g., "Employee Name field")' },
                  example: { type: 'string', example: 'Employee Name field' }
                }
              }
            }
          }
        }
      }
    }
  })
  async getLLMStatus() {
    const geminiApiKeyConfigured = !!process.env.OPENAI_API_KEY;
    
    return {
      llmAvailable: geminiApiKeyConfigured,
      geminiApiKeyConfigured,
      availableStrategies: [
        {
          value: BusinessDescriptionStrategy.TECHNICAL_SIMPLE,
          label: 'Technical Simple',
          description: 'Simple technical descriptions (e.g., "Employee Name field", "Employees table")',
          example: 'Employee Name field'
        },
        {
          value: BusinessDescriptionStrategy.TYPE_BASED,
          label: 'Type Based',
          description: 'Descriptions based on field type (e.g., "Text field for storing single line data")',
          example: 'Text field for storing single line data'
        },
        {
          value: BusinessDescriptionStrategy.HYBRID,
          label: 'Hybrid (Default)',
          description: 'Combination of name and type information (e.g., "Employee Name - Text field for storing employee names")',
          example: 'Employee Name - Text field for storing employee names'
        }
      ]
    };
  }

  @Post('generate')
  @ApiOperation({
    summary: 'Generate DBML with AI-powered descriptions',
    description: `Converts an Airtable schema to DBML format with AI-generated business descriptions.
    
Features:
- Converts Airtable schema to DBML format
- Automatically generates business descriptions for fields and tables using Gemini AI
- Respects existing descriptions if present (optional overwrite)
- Includes detailed technical metadata
- Maintains relationships between tables
- Customizable AI model and parameters`,
  })
  @ApiBody({
    description: 'The Airtable schema with optional Gemini AI configuration for business descriptions generation.',
    type: CreateJsonDbmlDto,
    examples: {
      basic: {
        summary: 'Basic schema without AI',
        value: {
          tables: [
            {
              id: 'tbl123ABC',
              name: 'Employees',
              primaryFieldId: 'fld123XYZ',
              fields: [
                {
                  id: 'fld123XYZ',
                  type: 'singleLineText',
                  name: 'Name',
                  description: 'Employee full name'
                },
                {
                  id: 'fld456DEF',
                  type: 'email',
                  name: 'Email',
                  description: 'Employee email address'
                }
              ]
            }
          ]
        }
      },
      withGeminiConfig: {
        summary: 'Schema with Gemini AI configuration',
        value: {
          tables: [
            {
              id: 'tbl123ABC',
              name: 'Employees',
              primaryFieldId: 'fld123XYZ',
              fields: [
                {
                  id: 'fld123XYZ',
                  type: 'singleLineText',
                  name: 'Name',
                  description: 'Employee full name'
                },
                {
                  id: 'fld456DEF',
                  type: 'email',
                  name: 'Email',
                  description: 'Employee email address'
                }
              ]
            }
          ],
          geminiConfig: {
            model: 'gpt-4o-mini',
            overwriteFieldDescriptions: false,
            overwriteTableDescriptions: false
          }
        }
      },
      withoutLLM: {
        summary: 'Schema with LLM disabled (no AI generation)',
        value: {
          tables: [
            {
              id: 'tbl123ABC',
              name: 'Employees',
              primaryFieldId: 'fld123XYZ',
              fields: [
                {
                  id: 'fld123XYZ',
                  type: 'singleLineText',
                  name: 'Name'
                },
                {
                  id: 'fld456DEF',
                  type: 'email',
                  name: 'Email'
                }
              ]
            }
          ],
          geminiConfig: {
            disableLLM: true,
            businessDescriptionStrategy: 'hybrid'
          }
        }
      },
      technicalSimple: {
        summary: 'Schema with technical simple descriptions',
        value: {
          tables: [
            {
              id: 'tbl123ABC',
              name: 'Employees',
              primaryFieldId: 'fld123XYZ',
              fields: [
                {
                  id: 'fld123XYZ',
                  type: 'singleLineText',
                  name: 'Name'
                }
              ]
            }
          ],
          geminiConfig: {
            disableLLM: true,
            businessDescriptionStrategy: 'technical_simple'
          }
        }
      },
      typeBased: {
        summary: 'Schema with type-based descriptions',
        value: {
          tables: [
            {
              id: 'tbl123ABC',
              name: 'Employees',
              primaryFieldId: 'fld123XYZ',
              fields: [
                {
                  id: 'fld123XYZ',
                  type: 'singleLineText',
                  name: 'Name'
                }
              ]
            }
          ],
          geminiConfig: {
            disableLLM: true,
            businessDescriptionStrategy: 'type_based'
          }
        }
      }
    }
  })
  @ApiQuery({
    name: 'useAirtableTypes',
    type: Boolean,
    required: false,
    description:
      'If true, uses Airtable field types in the DBML. Defaults to false, mapping field types to DBML-compatible types.',
  })
  @ApiQuery({
    name: 'useAI',
    type: Boolean,
    required: false,
    description:
      'If false, disables AI generation and uses predefined business descriptions. Defaults to true, enabling AI-powered descriptions.',
  })
  @ApiResponse({
    status: 201,
    description: 'DBML file successfully generated and ready for download.',
    content: {
      'application/octet-stream': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while processing the provided schema or generating descriptions.',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 400 },
            message: { type: 'string', example: 'Error generating descriptions: API rate limit exceeded' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 500 },
            message: { type: 'string', example: 'Internal server error' }
          }
        }
      }
    }
  })
  @Header('Content-Type', 'application/octet-stream')
  @Header('Content-Disposition', 'attachment; filename="output.dbml"')
  async generateDbml(
    @Body() jsonGlobal: CreateJsonDbmlDto,
    @Res() res: Response,
    @Query('useAirtableTypes') useAirtableTypes: string,
    @Query('useAI') useAI: string,
  ): Promise<void> {
    try {
      // Convert the query parameters to boolean values
      const useAirtableTypesBool = useAirtableTypes === 'true';
      const useAIBool = useAI !== 'false'; // Default to true unless explicitly set to false

      // If AI is disabled, set the disableLLM flag in the configuration
      if (!useAIBool) {
        if (!jsonGlobal.geminiConfig) {
          jsonGlobal.geminiConfig = {};
        }
        jsonGlobal.geminiConfig.disableLLM = true;
        jsonGlobal.geminiConfig.businessDescriptionStrategy = BusinessDescriptionStrategy.HYBRID;
      }

      // Process the JSON and generate the DBML content (now async)
      const dbml = await this.jsonDbmlService.processJsonToDbml(jsonGlobal, useAirtableTypesBool);

      // Create a temporary file for the DBML
      const tempFilePath = path.join(__dirname, '../../', 'output.dbml');
      fs.writeFileSync(tempFilePath, dbml, 'utf-8');

      // Send the file as a downloadable response
      res.download(tempFilePath, 'output.dbml', (err) => {
        if (err) {
          throw new Error('Error sending the DBML file.');
        }

        // Delete the temporary file after successful sending
        fs.unlinkSync(tempFilePath);
      });
    } catch (error) {
      console.error('Error generating DBML:', error);
      // Handle errors and send an HTTP 400 response
      res.status(400).json({
        statusCode: 400,
        message: error.message || 'Error processing request',
      });
    }
  }

  @Post('generate-async')
  @HttpCode(202) // Accepted
  @ApiOperation({
    summary: 'Generate DBML asynchronously',
    description: `Starts an asynchronous job to convert Airtable schema to DBML with AI-generated descriptions.
    
How to use:
1. Submit your schema to this endpoint
2. You'll get a Job ID in the response
3. Check the status at GET /jobs/{jobId}/status
4. When status is "completed", download the result from GET /jobs/{jobId}/download
    
This is ideal for processing large schemas with many tables and fields.`,
  })
  @ApiBody({
    description: 'The Airtable schema with optional Gemini AI configuration for business descriptions generation.',
    type: CreateJsonDbmlDto,
    examples: {
      basic: {
        summary: 'Basic schema without AI',
        value: {
          tables: [
            {
              id: 'tbl123ABC',
              name: 'Employees',
              primaryFieldId: 'fld123XYZ',
              fields: [
                {
                  id: 'fld123XYZ',
                  type: 'singleLineText',
                  name: 'Name',
                  description: 'Employee full name'
                },
                {
                  id: 'fld456DEF',
                  type: 'email',
                  name: 'Email',
                  description: 'Employee email address'
                }
              ]
            }
          ]
        }
      },
      withGeminiConfig: {
        summary: 'Schema with Gemini AI configuration',
        value: {
          tables: [
            {
              id: 'tbl123ABC',
              name: 'Employees',
              primaryFieldId: 'fld123XYZ',
              fields: [
                {
                  id: 'fld123XYZ',
                  type: 'singleLineText',
                  name: 'Name',
                  description: 'Employee full name'
                },
                {
                  id: 'fld456DEF',
                  type: 'email',
                  name: 'Email',
                  description: 'Employee email address'
                }
              ]
            }
          ],
          geminiConfig: {
            model: 'gpt-4o-mini',
            overwriteFieldDescriptions: false,
            overwriteTableDescriptions: false
          }
        }
      },
      withoutLLM: {
        summary: 'Schema with LLM disabled (no AI generation)',
        value: {
          tables: [
            {
              id: 'tbl123ABC',
              name: 'Employees',
              primaryFieldId: 'fld123XYZ',
              fields: [
                {
                  id: 'fld123XYZ',
                  type: 'singleLineText',
                  name: 'Name'
                },
                {
                  id: 'fld456DEF',
                  type: 'email',
                  name: 'Email'
                }
              ]
            }
          ],
          geminiConfig: {
            disableLLM: true,
            businessDescriptionStrategy: 'hybrid'
          }
        }
      },
      technicalSimple: {
        summary: 'Schema with technical simple descriptions',
        value: {
          tables: [
            {
              id: 'tbl123ABC',
              name: 'Employees',
              primaryFieldId: 'fld123XYZ',
              fields: [
                {
                  id: 'fld123XYZ',
                  type: 'singleLineText',
                  name: 'Name'
                }
              ]
            }
          ],
          geminiConfig: {
            disableLLM: true,
            businessDescriptionStrategy: 'technical_simple'
          }
        }
      },
      typeBased: {
        summary: 'Schema with type-based descriptions',
        value: {
          tables: [
            {
              id: 'tbl123ABC',
              name: 'Employees',
              primaryFieldId: 'fld123XYZ',
              fields: [
                {
                  id: 'fld123XYZ',
                  type: 'singleLineText',
                  name: 'Name'
                }
              ]
            }
          ],
          geminiConfig: {
            disableLLM: true,
            businessDescriptionStrategy: 'type_based'
          }
        }
      }
    }
  })
  @ApiQuery({
    name: 'useAirtableTypes',
    type: Boolean,
    required: false,
    description: 'If true, uses Airtable field types in the DBML. Defaults to false.',
  })
  @ApiQuery({
    name: 'useAI',
    type: Boolean,
    required: false,
    description: 'If false, disables AI generation and uses predefined business descriptions. Defaults to true, enabling AI-powered descriptions.',
  })
  @ApiResponse({
    status: 202,
    description: 'Job accepted and processing started',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        status: { type: 'string', example: 'pending' },
        message: { type: 'string' },
        statusUrl: { type: 'string' },
        downloadUrl: { type: 'string' },
        schemaInfo: {
          type: 'object',
          properties: {
            sizeInMB: { type: 'number', example: 2.45 },
            tables: { type: 'number', example: 15 },
            totalFields: { type: 'number', example: 120 }
          }
        }
      },
    },
  })
  async generateDbmlAsync(
    @Body() jsonGlobal: CreateJsonDbmlDto,
    @Query('useAirtableTypes') useAirtableTypes: string,
    @Query('useAI') useAI: string,
  ) {
    const useAirtableTypesBool = useAirtableTypes === 'true';
    const useAIBool = useAI !== 'false'; // Default to true unless explicitly set to false

    // If AI is disabled, set the disableLLM flag in the configuration
    if (!useAIBool) {
      if (!jsonGlobal.geminiConfig) {
        jsonGlobal.geminiConfig = {};
      }
      jsonGlobal.geminiConfig.disableLLM = true;
      jsonGlobal.geminiConfig.businessDescriptionStrategy = BusinessDescriptionStrategy.HYBRID;
    }
    
    // Calcular el tamaño del JSON en MB
    const jsonSize = this.calculateJsonSizeMB(jsonGlobal);
    
    // Calcular el número total de campos
    const totalFields = jsonGlobal.tables.reduce((sum, table) => sum + table.fields.length, 0);
    
    // Crear un nuevo trabajo
    const jobId = this.jobService.createJob('dbml-generation');
    
    // Iniciar el procesamiento en segundo plano (sin await)
    setTimeout(() => {
      this.jobService.processAsyncJob(jobId, async (updateProgress) => {
        // Calcular el total de elementos a procesar para estimación de progreso
        const totalTables = jsonGlobal.tables.length;
        let totalProcessableFields = 0;
        jsonGlobal.tables.forEach(table => {
          totalProcessableFields += table.fields.length;
        });
        const totalItems = totalTables + totalProcessableFields;
        let processedItems = 0;
        
        // Reemplazar la implementación de processJsonToDbml para reportar progreso
        return await this.jsonDbmlService.processJsonToDbmlWithProgress(
          jsonGlobal,
          useAirtableTypesBool,
          (currentItem, itemType, name) => {
            processedItems++;
            const progress = Math.floor((processedItems / totalItems) * 100);
            updateProgress(
              progress, 
              `Processing ${itemType}: ${name} (${processedItems}/${totalItems})`
            );
          }
        );
      });
    }, 0);
    
    // Devolver inmediatamente el ID del trabajo y URLs útiles junto con el tamaño del JSON
    return {
      jobId,
      status: 'pending',
      message: 'DBML generation job started successfully',
      statusUrl: `/jobs/${jobId}/status`,
      downloadUrl: `/jobs/${jobId}/download`,
      schemaInfo: {
        sizeInMB: jsonSize,
        tables: jsonGlobal.tables.length,
        totalFields: totalFields
      }
    };
  }

  @Post('generate-from-schema-job')
  @HttpCode(202) // Accepted
  @ApiOperation({
    summary: 'Generate DBML from previous schema extraction job',
    description: `Starts an asynchronous job to convert Airtable schema to DBML using a previous schema extraction job.
    
## Prerequisites
- A **successful** schema extraction job (status: completed, no errors)
- The schema job must contain valid table data

## How to use:
1. **First, extract schema** using the schema-extractor endpoint to get a Job ID
2. **Verify the schema job** using GET /json-dbml/validate-schema-job/{schemaJobId} to ensure it's valid
3. **Submit the Job ID** to this endpoint along with your DBML generation preferences
4. **Check the status** at GET /jobs/{jobId}/status
5. **Download the result** from GET /jobs/{jobId}/download when status is "completed"

## Important Notes:
- This endpoint will fail if the schema extraction job failed or contains errors
- Use the validation endpoint first to check schema job status
- If schema extraction failed, fix the issue and try again before using this endpoint

This eliminates the need to copy and paste the schema between endpoints.`,
  })
  @ApiQuery({
    name: 'schemaJobId',
    type: String,
    required: true,
    description: 'Job ID from previous schema extraction job',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  })
  @ApiQuery({
    name: 'useAirtableTypes',
    type: Boolean,
    required: false,
    description: 'If true, uses Airtable field types in the DBML. Defaults to false.',
  })
  @ApiQuery({
    name: 'useAI',
    type: Boolean,
    required: false,
    description: 'If false, disables AI generation and uses predefined business descriptions. Defaults to true, enabling AI-powered descriptions.',
  })
  @ApiResponse({
    status: 202,
    description: 'Job accepted and processing started',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        status: { type: 'string', example: 'pending' },
        message: { type: 'string' },
        statusUrl: { type: 'string' },
        downloadUrl: { type: 'string' },
        schemaJobId: { type: 'string', description: 'The schema job ID that was used' },
        schemaInfo: {
          type: 'object',
          properties: {
            sizeInMB: { type: 'number', example: 2.45 },
            tables: { type: 'number', example: 15 },
            totalFields: { type: 'number', example: 120 }
          }
        }
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Error while processing the schema job or generating DBML',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 400 },
            message: { type: 'string', example: 'Schema job not found or invalid' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 500 },
            message: { type: 'string', example: 'Internal server error' }
          }
        }
      }
    }
  })
  async generateDbmlFromSchemaJob(
    @Query('schemaJobId') schemaJobId: string,
    @Query('useAirtableTypes') useAirtableTypes: string,
    @Query('useAI') useAI: string,
  ) {
    try {
      // Validate required parameter
      if (!schemaJobId) {
        throw new Error('schemaJobId is required');
      }

      // Get the schema from the previous job
      const schemaJobResult = this.jobService.getJobResultPath(schemaJobId);
      
      if (!fs.existsSync(schemaJobResult)) {
        throw new Error(`Schema job ${schemaJobId} not found or not completed`);
      }

      // Read the schema content
      const schemaContent = fs.readFileSync(schemaJobResult, 'utf-8');
      let schemaData;
      
      try {
        schemaData = JSON.parse(schemaContent);
      } catch (parseError) {
        throw new Error(`Invalid JSON schema from job ${schemaJobId}`);
      }

      // Validate that it's a valid schema
      if (!schemaData.tables || !Array.isArray(schemaData.tables)) {
        // Check if it's an error response from schema extraction
        if (schemaData.error) {
          const errorDetails = schemaData.details ? ` (Base: ${schemaData.details.baseId})` : '';
          throw new Error(`Schema extraction failed: ${schemaData.message}${errorDetails}. Please fix the issue and try schema extraction again.`);
        }
        
        // Check if it's an empty or malformed response
        if (typeof schemaData === 'string') {
          throw new Error(`Schema job ${schemaJobId} returned a string instead of JSON. This usually indicates an error during processing.`);
        }
        
        throw new Error(`Invalid schema format from job ${schemaJobId}. Expected 'tables' array but got: ${JSON.stringify(schemaData).substring(0, 200)}...`);
      }
      
      // Additional validation: check if tables array is empty
      if (schemaData.tables.length === 0) {
        throw new Error(`Schema from job ${schemaJobId} contains no tables. This might indicate an empty base or extraction error.`);
      }

      // Convert query parameters to boolean values
      const useAirtableTypesBool = useAirtableTypes === 'true';
      const useAIBool = useAI !== 'false'; // Default to true unless explicitly set to false

      // If AI is disabled, set the disableLLM flag in the configuration
      if (!useAIBool) {
        if (!schemaData.geminiConfig) {
          schemaData.geminiConfig = {};
        }
        schemaData.geminiConfig.disableLLM = true;
        schemaData.geminiConfig.businessDescriptionStrategy = BusinessDescriptionStrategy.HYBRID;
      }
      
      // Calculate JSON size in MB
      const jsonSize = this.calculateJsonSizeMB(schemaData);
      
      // Calculate total number of fields
      const totalFields = schemaData.tables.reduce((sum: number, table: any) => sum + table.fields.length, 0);
      
      // Create a new job
      const jobId = this.jobService.createJob('dbml-generation');
      
      // Start background processing (without await)
      setTimeout(() => {
        this.jobService.processAsyncJob(jobId, async (updateProgress) => {
          // Calculate total items to process for progress estimation
          const totalTables = schemaData.tables.length;
          let totalProcessableFields = 0;
          schemaData.tables.forEach((table: any) => {
            totalProcessableFields += table.fields.length;
          });
          const totalItems = totalTables + totalProcessableFields;
          let processedItems = 0;
          
          // Process the schema to generate DBML with progress reporting
          return await this.jsonDbmlService.processJsonToDbmlWithProgress(
            schemaData,
            useAirtableTypesBool,
            (currentItem, itemType, name) => {
              processedItems++;
              const progress = Math.floor((processedItems / totalItems) * 100);
              updateProgress(
                progress, 
                `Processing ${itemType}: ${name} (${processedItems}/${totalItems})`
              );
            }
          );
        });
      }, 0);
      
      // Return immediately the job ID and useful URLs along with schema info
      return {
        jobId,
        status: 'pending',
        message: 'DBML generation job started successfully from schema job',
        statusUrl: `/jobs/${jobId}/status`,
        downloadUrl: `/jobs/${jobId}/download`,
        schemaJobId: schemaJobId,
        schemaInfo: {
          sizeInMB: jsonSize,
          tables: schemaData.tables.length,
          totalFields: totalFields
        }
      };
    } catch (error) {
      console.error('Error starting DBML generation from schema job:', error);
      throw error;
    }
  }

  @Get('validate-schema-job/:schemaJobId')
  @ApiOperation({
    summary: 'Validate schema job before DBML generation',
    description: `Validates that a schema extraction job completed successfully and contains valid data before attempting DBML generation.
    
This endpoint helps prevent errors by checking:
- Job completion status
- Schema validity
- Data structure
- Error conditions`,
  })
  @ApiResponse({
    status: 200,
    description: 'Schema job validation result',
    schema: {
      type: 'object',
      properties: {
        valid: { type: 'boolean' },
        message: { type: 'string' },
        schemaInfo: {
          type: 'object',
          properties: {
            tables: { type: 'number' },
            totalFields: { type: 'number' },
            sizeInMB: { type: 'number' }
          }
        },
        errors: { type: 'array', items: { type: 'string' } }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Schema job validation failed',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 400 },
            message: { type: 'string' },
            errors: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  })
  async validateSchemaJob(@Query('schemaJobId') schemaJobId: string) {
    try {
      // Validate required parameter
      if (!schemaJobId) {
        throw new Error('schemaJobId is required');
      }

      // Get the schema from the previous job
      const schemaJobResult = this.jobService.getJobResultPath(schemaJobId);
      
      if (!fs.existsSync(schemaJobResult)) {
        return {
          valid: false,
          message: `Schema job ${schemaJobId} not found or not completed`,
          errors: ['Job result file does not exist']
        };
      }

      // Read the schema content
      const schemaContent = fs.readFileSync(schemaJobResult, 'utf-8');
      let schemaData;
      
      try {
        schemaData = JSON.parse(schemaContent);
      } catch (parseError) {
        return {
          valid: false,
          message: `Invalid JSON schema from job ${schemaJobId}`,
          errors: ['Schema content is not valid JSON']
        };
      }

      // Check if it's an error response
      if (schemaData.error) {
        return {
          valid: false,
          message: `Schema extraction failed: ${schemaData.message}`,
          errors: [
            'Schema extraction job failed',
            schemaData.message,
            schemaData.details ? `Base ID: ${schemaData.details.baseId}` : 'No base ID available'
          ]
        };
      }

      // Validate schema structure
      if (!schemaData.tables || !Array.isArray(schemaData.tables)) {
        return {
          valid: false,
          message: `Invalid schema format from job ${schemaJobId}`,
          errors: [
            'Schema does not contain tables array',
            `Expected structure: { tables: [...] }, got: ${JSON.stringify(schemaData).substring(0, 100)}...`
          ]
        };
      }

      if (schemaData.tables.length === 0) {
        return {
          valid: false,
          message: `Schema from job ${schemaJobId} contains no tables`,
          errors: ['Tables array is empty', 'This might indicate an empty base or extraction error']
        };
      }

      // Calculate schema info
      const totalFields = schemaData.tables.reduce((sum: number, table: any) => sum + table.fields.length, 0);
      const jsonSize = this.calculateJsonSizeMB(schemaData);

      return {
        valid: true,
        message: `Schema job ${schemaJobId} is valid and ready for DBML generation`,
        schemaInfo: {
          tables: schemaData.tables.length,
          totalFields: totalFields,
          sizeInMB: jsonSize
        },
        errors: []
      };
    } catch (error) {
      return {
        valid: false,
        message: `Error validating schema job: ${error.message}`,
        errors: [error.message]
      };
    }
  }

  // Método auxiliar para calcular el tamaño del JSON en MB
  private calculateJsonSizeMB(obj: any): number {
    // Convertir el objeto a cadena JSON
    const jsonString = JSON.stringify(obj);
    
    // Calcular el tamaño en bytes
    const bytes = new TextEncoder().encode(jsonString).length;
    
    // Convertir a megabytes y redondear a 2 decimales
    return Math.round((bytes / 1024 / 1024) * 100) / 100;
  }
}
