import { Controller, Post, Body, HttpCode, Logger, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { SchemaExtractorService } from './schema-extractor.service';
import { ExtractSchemaDto } from './dto/extract-schema.dto';
import { JobService } from '../job/job.service';
import axios from 'axios';

@ApiTags('schema-extractor')
@Controller('schema-extractor')
export class SchemaExtractorController {
  private readonly logger = new Logger(SchemaExtractorController.name);
  
  constructor(
    private readonly schemaExtractorService: SchemaExtractorService,
    private readonly jobService: JobService,
  ) {}

  @Get('test-connection')
  @ApiOperation({
    summary: 'Test Airtable API connection',
    description: `Tests the connection to Airtable API with provided credentials.
    
This endpoint helps diagnose connection issues by:
- Validating token format
- Testing API connectivity
- Checking base access permissions
- Providing detailed error information`,
  })
  @ApiResponse({
    status: 200,
    description: 'Connection test successful',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        baseInfo: {
          type: 'object',
          properties: {
            baseId: { type: 'string' },
            tablesCount: { type: 'number' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Connection test failed',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            details: { type: 'string' }
          }
        }
      }
    }
  })
  async testConnection(
    @Query('baseId') baseId: string,
    @Query('accessToken') accessToken: string,
  ) {
    try {
      if (!baseId || !accessToken) {
        return {
          success: false,
          error: 'Missing parameters',
          details: 'Both baseId and accessToken are required as query parameters'
        };
      }

      // Test the connection by making a minimal request
      const apiUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      };

      const response = await axios.get(apiUrl, { 
        headers, 
        timeout: 10000,
        validateStatus: (status: number) => status < 500
      });

      if (response.data && response.data.tables) {
        return {
          success: true,
          message: 'Connection successful',
          baseInfo: {
            baseId: baseId,
            tablesCount: response.data.tables.length
          }
        };
      } else {
        return {
          success: false,
          error: 'Invalid response format',
          details: 'Response does not contain expected table data'
        };
      }
    } catch (error) {
      let errorMessage = 'Unknown error';
      let details = '';

      if (error.response) {
        errorMessage = `HTTP ${error.response.status}`;
        details = error.response.data?.error?.message || JSON.stringify(error.response.data);
      } else if (error.code) {
        errorMessage = `Network error: ${error.code}`;
        details = error.message;
      } else {
        details = error.message;
      }

      return {
        success: false,
        error: errorMessage,
        details: details
      };
    }
  }

  @Post('extract')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Extract schema from Airtable',
    description: `Starts an asynchronous job to extract the complete schema directly from Airtable API.
    
## Key Features

- **Direct Connection**: Connects to Airtable API using your credentials
- **Complete Schema**: Extracts all tables, fields, and metadata
- **Ready for DBML Generation**: Returns schema in format compatible with DBML generation
- **No Manual Schema Export**: Eliminates the need to manually export schema from Airtable

## How It Works

1. Submit your Airtable Base ID and Personal Access Token
2. The system connects to Airtable API and extracts the complete schema
3. The schema is processed and stored in a format ready for DBML generation
4. Use the extracted schema as input for the DBML generation endpoints

## Next Steps After Extraction

Once the schema is extracted, you can:
1. Use the schema with \`/dbml/generate\` or \`/dbml/generate-async\` to create DBML with AI descriptions
2. Use the generated DBML with \`/airtable-docs/update-from-job\` to update Airtable with descriptions

## About Personal Access Tokens

- Requires an Airtable Personal Access Token (starting with "pat")
- Create tokens in your Airtable account settings
- Make sure your token has permission to read schema metadata
`,
  })
  @ApiBody({
    type: ExtractSchemaDto,
    description: 'Airtable credentials for schema extraction',
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
        resultUrl: { type: 'string' },
      },
    },
  })
  async extractSchema(@Body() schemaDto: ExtractSchemaDto) {
    // Crear un nuevo trabajo
    const jobId = this.jobService.createJob('schema-extraction');
    
    // Iniciar el procesamiento en segundo plano
    setTimeout(() => {
      this.jobService.processAsyncJob(jobId, async (updateProgress) => {
        try {
          // Extraer el esquema de Airtable
          return await this.schemaExtractorService.extractAirtableSchema(
            schemaDto.baseId,
            schemaDto.accessToken,
            updateProgress
          );
        } catch (error) {
          this.logger.error(`Schema extraction failed for base ${schemaDto.baseId}: ${error.message}`);
          return JSON.stringify({
            error: true,
            message: error.message,
            details: {
              baseId: schemaDto.baseId,
              timestamp: new Date().toISOString(),
              errorType: error.constructor.name
            }
          }, null, 2);
        }
      });
    }, 0);
    
    // Devolver inmediatamente el ID del trabajo y URLs útiles
    return {
      jobId,
      status: 'pending',
      message: 'Schema extraction process started.',
      statusUrl: `/jobs/${jobId}/status`,
      resultUrl: `/jobs/${jobId}/result`,
    };
  }
}
