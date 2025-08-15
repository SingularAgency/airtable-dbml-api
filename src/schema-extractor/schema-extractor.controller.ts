import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { SchemaExtractorService } from './schema-extractor.service';
import { ExtractSchemaDto } from './dto/extract-schema.dto';
import { JobService } from '../job/job.service';

@ApiTags('schema-extractor')
@Controller('schema-extractor')
export class SchemaExtractorController {
  constructor(
    private readonly schemaExtractorService: SchemaExtractorService,
    private readonly jobService: JobService,
  ) {}

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

- Requires an Airtable Personal Access Token (starting with "pat.")
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
          return JSON.stringify({
            error: true,
            message: error.message,
            stack: error.stack,
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
