import { Controller, Post, Body, HttpCode, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AirtableDocsService } from './airtable-docs.service';
import { AirtableDocsJobDto } from './dto/airtable-docs-job.dto';
import { AirtableDocsFileDto } from './dto/airtable-docs-file.dto';
import { JobService } from '../job/job.service';
import * as fs from 'fs';

@ApiTags('airtable-docs')
@Controller('airtable-docs')
export class AirtableDocsController {
  constructor(
    private readonly airtableDocsService: AirtableDocsService,
    private readonly jobService: JobService,
  ) {}

  @Post('update-from-job')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Update Airtable from previous DBML job',
    description: `Starts an asynchronous job to update Airtable table and field descriptions using a DBML file from a previous job.
    
## Key Features

- **Intelligent Processing**: Extracts business descriptions from DBML and applies them to corresponding tables and fields in Airtable.
- **Respects Existing Documentation**: By default, only updates empty descriptions, unless force update option is enabled.
- **Table Protection**: When force update is enabled, you can specify tables to protect from overwriting.
- **Field Name Conversion**: Optionally convert field names to snake_case format for consistency.
- **Real-time Progress**: Provides detailed information about the process progress.
- **Error Handling**: Records and reports detailed errors during the process.
- **Rate Limiting**: Includes pauses between requests to avoid Airtable API rate limits.

## How It Works

1. Submit your previous DBML job ID and Airtable credentials
2. The system retrieves the DBML from the previous job
3. It extracts business descriptions and maps them to Airtable tables and fields
4. Updates only empty descriptions unless force update is enabled
5. When force update is enabled, protected tables are skipped
6. Returns a detailed report of the process
`,
  })
  @ApiBody({
    type: AirtableDocsJobDto,
    description: 'Airtable credentials and previous DBML job ID',
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
  async updateFromJob(@Body() docsDto: AirtableDocsJobDto) {
    // Crear un nuevo trabajo
    const jobId = this.jobService.createJob('airtable-documentation');
    
    // Configuración de Airtable
    const airtableConfig = {
      baseId: docsDto.baseId,
      accessToken: docsDto.accessToken,
      forceUpdate: docsDto.forceUpdate || false,
      protectedTables: docsDto.protectedTables || [],
      convertToSnakeCase: docsDto.convertToSnakeCase || false,
    };
    
    // Iniciar el procesamiento en segundo plano
    setTimeout(() => {
      this.jobService.processAsyncJob(jobId, async (updateProgress) => {
        // Obtener el contenido DBML del trabajo anterior
        const previousJobResult = this.jobService.getJobResultPath(docsDto.dbmlJobId);
        if (!fs.existsSync(previousJobResult)) {
          throw new Error(`DBML file from job ${docsDto.dbmlJobId} not found`);
        }
        
        // Leer el contenido DBML
        const dbmlContent = fs.readFileSync(previousJobResult, 'utf-8');
        
        // Procesar el contenido DBML
        return await this.airtableDocsService.processDbmlContentAndUpdateAirtable(
          airtableConfig,
          dbmlContent,
          updateProgress
        );
      });
    }, 0);
    
    // Devolver inmediatamente el ID del trabajo y URLs útiles
    return {
      jobId,
      status: 'pending',
      message: 'Processing started. Updating Airtable descriptions from previous DBML job.',
      statusUrl: `/jobs/${jobId}/status`,
      resultUrl: `/jobs/${jobId}/result`,
    };
  }

  @Post('update-from-file')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('dbmlFile'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update Airtable from uploaded DBML file',
    description: `Starts an asynchronous job to update Airtable table and field descriptions using an uploaded DBML file.
    
## Key Features

- **Intelligent Processing**: Extracts business descriptions from DBML and applies them to corresponding tables and fields in Airtable.
- **Respects Existing Documentation**: By default, only updates empty descriptions, unless force update option is enabled.
- **Table Protection**: When force update is enabled, you can specify tables to protect from overwriting.
- **Field Name Conversion**: Optionally convert field names to snake_case format for consistency.
- **Real-time Progress**: Provides detailed information about the process progress.
- **Error Handling**: Records and reports detailed errors during the process.
- **Rate Limiting**: Includes pauses between requests to avoid Airtable API rate limits.

## How It Works

1. Upload your DBML file and provide Airtable credentials
2. The system processes the uploaded DBML file
3. It extracts business descriptions and maps them to Airtable tables and fields
4. Updates only empty descriptions unless force update is enabled
5. When force update is enabled, protected tables are skipped
6. Returns a detailed report of the process
`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        baseId: { 
          type: 'string', 
          description: 'Base ID of the Airtable base',
          example: 'appXXXXXXXXXXXXXX' 
        },
        accessToken: { 
          type: 'string', 
          description: 'Access Token for Airtable',
          example: 'pat.XXXXXXXXXXXXXXXXXXXXXXXX' 
        },
        forceUpdate: { 
          type: 'boolean', 
          description: 'Whether to force update existing descriptions',
          default: false 
        },
        protectedTables: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of table names to protect from force update (will not be overwritten even if forceUpdate is true)',
          example: ['Users', 'Products', 'Orders']
        },
        convertToSnakeCase: {
          type: 'boolean',
          description: 'Whether to convert field names to snake_case format',
          default: false
        },
        dbmlFile: {
          type: 'string',
          format: 'binary',
          description: 'DBML file to upload'
        },
      },
      required: ['baseId', 'accessToken', 'dbmlFile']
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
        resultUrl: { type: 'string' },
      },
    },
  })
  async updateFromFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() docsDto: AirtableDocsFileDto
  ) {
    // Crear un nuevo trabajo
    const jobId = this.jobService.createJob('airtable-documentation');
    
    // Configuración de Airtable
    const airtableConfig = {
      baseId: docsDto.baseId,
      accessToken: docsDto.accessToken,
      forceUpdate: docsDto.forceUpdate || false,
      protectedTables: docsDto.protectedTables || [],
      convertToSnakeCase: docsDto.convertToSnakeCase || false,
    };
    
    // Iniciar el procesamiento en segundo plano
    setTimeout(() => {
      this.jobService.processAsyncJob(jobId, async (updateProgress) => {
        // Leer el contenido del archivo
        const dbmlContent = file.buffer.toString('utf-8');
        
        // Procesar el contenido DBML
        return await this.airtableDocsService.processDbmlContentAndUpdateAirtable(
          airtableConfig,
          dbmlContent,
          updateProgress
        );
      });
    }, 0);
    
    // Devolver inmediatamente el ID del trabajo y URLs útiles
    return {
      jobId,
      status: 'pending',
      message: 'Processing started. Updating Airtable descriptions from uploaded DBML file.',
      statusUrl: `/jobs/${jobId}/status`,
      resultUrl: `/jobs/${jobId}/result`,
    };
  }
}
