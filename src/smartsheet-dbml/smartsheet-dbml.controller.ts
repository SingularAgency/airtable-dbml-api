import {
  Controller,
  Post,
  Body,
  Query,
  HttpCode,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { SmartSheetDbmlService } from './smartsheet-dbml.service';
import { TypeMode } from '../json-dbml/json-dbml.service';
import { JsonDbmlService } from '../json-dbml/json-dbml.service';
import { JobService } from '../job/job.service';
import { BusinessDescriptionStrategy } from '../json-dbml/Dto/create-json-dbml.dto';

@ApiTags('smartsheet-dbml')
@Controller('smartsheet-dbml')
export class SmartSheetDbmlController {
  constructor(
    private readonly smartSheetDbmlService: SmartSheetDbmlService,
    private readonly jsonDbmlService: JsonDbmlService,
    private readonly jobService: JobService,
  ) {}

  @Post('generate')
  @HttpCode(202) // Accepted
  @ApiConsumes('application/json')
  @ApiOperation({
    summary: 'Generate DBML from SmartSheet JSON',
    description: `Starts an asynchronous job to convert SmartSheet JSON format to DBML.

## Input Options
Send the SmartSheet JSON directly in the request body as JSON.

**Note**: For file upload, use the 'smartsheet-dbml/generate-from-file' endpoint instead.

## Type Modes
The \`typeMode\` parameter controls which field types appear in the generated DBML:
- **dbml** (default): Standard DBML types (varchar, date, boolean, etc.)
- **smartsheet**: Original SmartSheet types (TEXT_NUMBER, DATE, CHECKBOX, etc.)
- **airtable**: Airtable field types (singleLineText, formula, date, etc.)

## How to use:
1. **Provide SmartSheet JSON** either in body or as file upload
2. **Set typeMode** to choose output type format (optional, defaults to 'dbml')
3. **Set useAI** to control AI description generation (optional, defaults to true)
4. **Check the status** at GET /jobs/{jobId}/status
5. **Download the result** from GET /jobs/{jobId}/download when status is "completed"

## SmartSheet JSON Format
The JSON should follow the SmartSheet data dictionary format:
\`\`\`json
[
  {
    "totalSheets": 61,
    "totalColumns": 1479,
    "data_dictionary": [
      {
        "sheet_id": 434135274311556,
        "sheet_name": "Table Name",
        "columns": [
          {
            "column_id": 2034768651440004,
            "title": "Field Name",
            "smartsheet_type": "TEXT_NUMBER",
            "is_computed": false,
            ...
          }
        ]
      }
    ]
  }
]
\`\`\``,
  })
  @ApiQuery({
    name: 'typeMode',
    enum: ['dbml', 'smartsheet', 'airtable'],
    required: false,
    description:
      "Type mode for DBML output. 'dbml' = standard DBML types, 'smartsheet' = original SmartSheet types, 'airtable' = Airtable field types. Defaults to 'dbml'.",
    example: 'dbml',
  })
  @ApiQuery({
    name: 'useAI',
    type: Boolean,
    required: false,
    description:
      'If false, disables AI generation and uses predefined business descriptions. Defaults to true, enabling AI-powered descriptions.',
  })
  @ApiBody({
    description: 'SmartSheet JSON data in request body',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          totalSheets: { type: 'number' },
          totalColumns: { type: 'number' },
          data_dictionary: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sheet_id: { type: 'number' },
                sheet_name: { type: 'string' },
                columns: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      column_id: { type: 'number' },
                      title: { type: 'string' },
                      smartsheet_type: { type: 'string' },
                      is_computed: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      example: [
        {
          totalSheets: 1,
          totalColumns: 5,
          data_dictionary: [
            {
              sheet_id: 123456,
              sheet_name: 'Example Table',
              columns: [
                {
                  column_id: 789012,
                  title: 'Example Field',
                  smartsheet_type: 'TEXT_NUMBER',
                  is_computed: false,
                },
              ],
            },
          ],
        },
      ],
    },
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
            totalFields: { type: 'number', example: 120 },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid SmartSheet JSON or validation error',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 400 },
            message: { type: 'string', example: 'Invalid SmartSheet JSON structure' },
          },
        },
      },
    },
  })
  async generate(
    @Body() body: any,
    @Query('typeMode') typeMode: string = 'dbml',
    @Query('useAI') useAI: string = 'true',
  ) {
    try {
      // Validate typeMode
      const validTypeModes: TypeMode[] = ['dbml', 'smartsheet', 'airtable'];
      const typeModeValue: TypeMode = validTypeModes.includes(typeMode as TypeMode)
        ? (typeMode as TypeMode)
        : 'dbml';

      // Parse SmartSheet JSON from body
      if (!body || (Array.isArray(body) && body.length === 0) || (typeof body === 'object' && Object.keys(body).length === 0)) {
        throw new BadRequestException(
          'No SmartSheet JSON provided in request body.',
        );
      }

      const smartsheetJson = body;

      // Validate SmartSheet JSON structure
      this.smartSheetDbmlService.validateSmartSheetJson(smartsheetJson);

      // Prepare gemini config for formula analysis
      const geminiConfig: any = {};
      if (useAI !== 'false') {
        geminiConfig.disableLLM = false;
        geminiConfig.model = 'gpt-4o-mini'; // Can be made configurable
      } else {
        geminiConfig.disableLLM = true;
      }

      // Convert SmartSheet format to Airtable format (async for formula analysis)
      const airtableFormat =
        await this.smartSheetDbmlService.convertSmartSheetToAirtableFormat(
          smartsheetJson,
          geminiConfig,
        );

      // Convert query parameters
      const useAIBool = useAI !== 'false'; // Default to true unless explicitly set to false
      const useAirtableTypesBool =
        typeModeValue === 'airtable' || typeModeValue === 'smartsheet';

      // If AI is disabled, set the disableLLM flag in the configuration
      if (!useAIBool) {
        if (!airtableFormat.geminiConfig) {
          airtableFormat.geminiConfig = {};
        }
        airtableFormat.geminiConfig.disableLLM = true;
        airtableFormat.geminiConfig.businessDescriptionStrategy =
          BusinessDescriptionStrategy.HYBRID;
      }

      // Calculate JSON size in MB
      const jsonSize = this.calculateJsonSizeMB(airtableFormat);

      // Calculate total number of fields
      const totalFields = airtableFormat.tables.reduce(
        (sum: number, table: any) => sum + table.fields.length,
        0,
      );

      // Create a new job
      const jobId = this.jobService.createJob('dbml-generation');

      // Start background processing (without await)
      setTimeout(() => {
        this.jobService.processAsyncJob(jobId, async (updateProgress) => {
          try {
            // Calculate total items to process for progress estimation
            const totalTables = airtableFormat.tables.length;
            let totalProcessableFields = 0;
            airtableFormat.tables.forEach((table: any) => {
              totalProcessableFields += table.fields.length;
            });
            const totalItems = totalTables + totalProcessableFields;
            let processedItems = 0;

            // Create function to get original SmartSheet type from field
            const getOriginalSmartSheetType = (field: any): string | undefined => {
              return field.options?.originalSmartSheetType;
            };

            // Process the converted data to generate DBML with progress reporting
            return await this.jsonDbmlService.processJsonToDbmlWithProgress(
              airtableFormat,
              useAirtableTypesBool,
              (currentItem, itemType, name) => {
                processedItems++;
                const progress = Math.floor((processedItems / totalItems) * 100);
                updateProgress(
                  progress,
                  `Processing ${itemType}: ${name} (${processedItems}/${totalItems})`,
                );
              },
              typeModeValue,
              getOriginalSmartSheetType,
            );
          } catch (error) {
            throw new Error(
              `Error generating DBML: ${error.message}`,
            );
          }
        });
      }, 0);

      // Return immediately the job ID and useful URLs along with schema info
      return {
        jobId,
        status: 'pending',
        message: 'DBML generation job started successfully from SmartSheet JSON',
        statusUrl: `/jobs/${jobId}/status`,
        downloadUrl: `/jobs/${jobId}/download`,
        schemaInfo: {
          sizeInMB: jsonSize,
          tables: airtableFormat.tables.length,
          totalFields: totalFields,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Error processing SmartSheet JSON: ${error.message}`,
      );
    }
  }

  @Post('generate-from-file')
  @HttpCode(202) // Accepted
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Generate DBML from SmartSheet JSON file',
    description: `Starts an asynchronous job to convert SmartSheet JSON format to DBML by uploading a JSON file.

## Input Options
Upload a JSON file containing SmartSheet data dictionary using multipart/form-data with field name 'file'.

## Type Modes
The \`typeMode\` parameter controls which field types appear in the generated DBML:
- **dbml** (default): Standard DBML types (varchar, date, boolean, etc.)
- **smartsheet**: Original SmartSheet types (TEXT_NUMBER, DATE, CHECKBOX, etc.)
- **airtable**: Airtable field types (singleLineText, formula, date, etc.)

## How to use:
1. **Upload SmartSheet JSON file** using the file input below
2. **Set typeMode** to choose output type format (optional, defaults to 'dbml')
3. **Set useAI** to control AI description generation (optional, defaults to true)
4. **Check the status** at GET /jobs/{jobId}/status
5. **Download the result** from GET /jobs/{jobId}/download when status is "completed"

## SmartSheet JSON Format
The JSON file should follow the SmartSheet data dictionary format:
\`\`\`json
[
  {
    "totalSheets": 61,
    "totalColumns": 1479,
    "data_dictionary": [
      {
        "sheet_id": 434135274311556,
        "sheet_name": "Table Name",
        "columns": [
          {
            "column_id": 2034768651440004,
            "title": "Field Name",
            "smartsheet_type": "TEXT_NUMBER",
            "is_computed": false,
            ...
          }
        ]
      }
    ]
  }
]
\`\`\``,
  })
  @ApiQuery({
    name: 'typeMode',
    enum: ['dbml', 'smartsheet', 'airtable'],
    required: false,
    description:
      "Type mode for DBML output. 'dbml' = standard DBML types, 'smartsheet' = original SmartSheet types, 'airtable' = Airtable field types. Defaults to 'dbml'.",
    example: 'dbml',
  })
  @ApiQuery({
    name: 'useAI',
    type: Boolean,
    required: false,
    description:
      'If false, disables AI generation and uses predefined business descriptions. Defaults to true, enabling AI-powered descriptions.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'A JSON file containing the SmartSheet data dictionary.',
        },
      },
    },
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
            totalFields: { type: 'number', example: 120 },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'No file uploaded or invalid file format',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 400 },
            message: { type: 'string', example: 'No file uploaded' },
          },
        },
      },
    },
  })
  async generateFromFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('typeMode') typeMode: string = 'dbml',
    @Query('useAI') useAI: string = 'true',
  ) {
    try {
      if (!file) {
        throw new BadRequestException(
          'No file uploaded. Please upload a file with the key "file".',
        );
      }

      // Validate typeMode
      const validTypeModes: TypeMode[] = ['dbml', 'smartsheet', 'airtable'];
      const typeModeValue: TypeMode = validTypeModes.includes(typeMode as TypeMode)
        ? (typeMode as TypeMode)
        : 'dbml';

      // Parse SmartSheet JSON from uploaded file
      let smartsheetJson: any;
      try {
        const fileContent = file.buffer.toString('utf-8');
        smartsheetJson = JSON.parse(fileContent);
      } catch (parseError) {
        throw new BadRequestException(
          `Invalid JSON file: ${parseError.message}`,
        );
      }

      // Validate SmartSheet JSON structure
      this.smartSheetDbmlService.validateSmartSheetJson(smartsheetJson);

      // Prepare gemini config for formula analysis
      const geminiConfig: any = {};
      if (useAI !== 'false') {
        geminiConfig.disableLLM = false;
        geminiConfig.model = 'gpt-4o-mini'; // Can be made configurable
      } else {
        geminiConfig.disableLLM = true;
      }

      // Convert SmartSheet format to Airtable format (async for formula analysis)
      const airtableFormat =
        await this.smartSheetDbmlService.convertSmartSheetToAirtableFormat(
          smartsheetJson,
          geminiConfig,
        );

      // Convert query parameters
      const useAIBool = useAI !== 'false'; // Default to true unless explicitly set to false
      const useAirtableTypesBool =
        typeModeValue === 'airtable' || typeModeValue === 'smartsheet';

      // If AI is disabled, set the disableLLM flag in the configuration
      if (!useAIBool) {
        if (!airtableFormat.geminiConfig) {
          airtableFormat.geminiConfig = {};
        }
        airtableFormat.geminiConfig.disableLLM = true;
        airtableFormat.geminiConfig.businessDescriptionStrategy =
          BusinessDescriptionStrategy.HYBRID;
      }

      // Calculate JSON size in MB
      const jsonSize = this.calculateJsonSizeMB(airtableFormat);

      // Calculate total number of fields
      const totalFields = airtableFormat.tables.reduce(
        (sum: number, table: any) => sum + table.fields.length,
        0,
      );

      // Create a new job
      const jobId = this.jobService.createJob('dbml-generation');

      // Start background processing (without await)
      setTimeout(() => {
        this.jobService.processAsyncJob(jobId, async (updateProgress) => {
          try {
            // Calculate total items to process for progress estimation
            const totalTables = airtableFormat.tables.length;
            let totalProcessableFields = 0;
            airtableFormat.tables.forEach((table: any) => {
              totalProcessableFields += table.fields.length;
            });
            const totalItems = totalTables + totalProcessableFields;
            let processedItems = 0;

            // Create function to get original SmartSheet type from field
            const getOriginalSmartSheetType = (field: any): string | undefined => {
              return field.options?.originalSmartSheetType;
            };

            // Process the converted data to generate DBML with progress reporting
            return await this.jsonDbmlService.processJsonToDbmlWithProgress(
              airtableFormat,
              useAirtableTypesBool,
              (currentItem, itemType, name) => {
                processedItems++;
                const progress = Math.floor((processedItems / totalItems) * 100);
                updateProgress(
                  progress,
                  `Processing ${itemType}: ${name} (${processedItems}/${totalItems})`,
                );
              },
              typeModeValue,
              getOriginalSmartSheetType,
            );
          } catch (error) {
            throw new Error(
              `Error generating DBML: ${error.message}`,
            );
          }
        });
      }, 0);

      // Return immediately the job ID and useful URLs along with schema info
      return {
        jobId,
        status: 'pending',
        message: 'DBML generation job started successfully from SmartSheet JSON file',
        statusUrl: `/jobs/${jobId}/status`,
        downloadUrl: `/jobs/${jobId}/download`,
        schemaInfo: {
          sizeInMB: jsonSize,
          tables: airtableFormat.tables.length,
          totalFields: totalFields,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Error processing SmartSheet JSON file: ${error.message}`,
      );
    }
  }

  /**
   * Helper method to calculate JSON size in MB
   */
  private calculateJsonSizeMB(obj: any): number {
    // Convert object to JSON string
    const jsonString = JSON.stringify(obj);

    // Calculate size in bytes
    const bytes = new TextEncoder().encode(jsonString).length;

    // Convert to megabytes and round to 2 decimal places
    return Math.round((bytes / 1024 / 1024) * 100) / 100;
  }
}
