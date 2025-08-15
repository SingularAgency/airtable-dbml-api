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
