import { Controller, Post, Body, HttpCode, Logger, UseInterceptors, UploadedFile, BadRequestException, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { JobService } from '../job/job.service';
import { CsvReportService } from './csv-report.service';
import { GenerateCsvReportDto } from './dto/generate-csv-report.dto';

@ApiTags('csv-report')
@Controller('csv-report')
export class CsvReportController {
  private readonly logger = new Logger(CsvReportController.name);

  constructor(
    private readonly csvReportService: CsvReportService,
    private readonly jobService: JobService,
  ) {}

  @Post('generate-from-file')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Generate CSV Inventory Report from an uploaded Airtable schema file',
    description: `Starts an asynchronous job to generate a detailed CSV inventory by uploading an Airtable schema JSON file.

## How It Works

1.  Upload a JSON file containing the schema definition previously extracted from Airtable.
2.  The system processes the schema to generate a CSV file with a complete inventory of all tables and fields.
3.  The output is a new job that, once completed, will contain the CSV file.

## Optional Features

- **generateDescriptions**: If set to \`true\`, generates AI-powered business descriptions for each field using the same AI configuration as json-dbml endpoints. If a field already has a description in the schema, it will be used directly without regeneration. If AI generation fails, a default description based on field type will be used.
`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'A JSON file containing the Airtable schema.',
        },
        generateDescriptions: {
          type: 'boolean',
          description: 'Optional. If true, generates AI-powered business descriptions for each field. Uses the same AI configuration as json-dbml endpoints. Defaults to false.',
          example: false,
        },
      },
    },
  })
  @ApiQuery({
    name: 'generateDescriptions',
    required: false,
    type: Boolean,
    description: 'Optional. If true, generates AI-powered business descriptions for each field. Uses the same AI configuration as json-dbml endpoints. Defaults to false.',
    example: false,
  })
  @ApiResponse({ status: 202, description: 'CSV generation job accepted and processing started.' })
  @ApiResponse({ status: 400, description: 'No file uploaded.' })
  async generateCsvReportFromFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('generateDescriptions') queryGenerateDescriptions?: string,
    @Body('generateDescriptions') bodyGenerateDescriptions?: string | boolean,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Please upload a file with the key "file".');
    }

    const newJobId = this.jobService.createJob('csv-report-generation');
    const fileContent = file.buffer.toString('utf-8');

    // Accept from either query parameter or body (multipart form-data)
    // Convert string 'true' or boolean true to boolean
    const queryValue = queryGenerateDescriptions === 'true';
    const bodyValue = bodyGenerateDescriptions === 'true' || bodyGenerateDescriptions === true || bodyGenerateDescriptions === '1';
    const shouldGenerateDescriptions = queryValue || bodyValue || false;

    setTimeout(() => {
      this.jobService.processAsyncJob(newJobId, async (updateProgress) => {
        try {
          return await this.csvReportService.generateReportFromFile(
            fileContent,
            updateProgress,
            shouldGenerateDescriptions,
          );
        } catch (error) {
          this.logger.error(`CSV Report generation failed from file upload: ${error.message}`);
          return JSON.stringify({
            error: true,
            message: error.message,
            details: {
              fileName: file.originalname,
              timestamp: new Date().toISOString(),
              errorType: error.constructor.name
            }
          }, null, 2);
        }
      });
    }, 0);

    return {
      jobId: newJobId,
      status: 'pending',
      message: 'CSV report generation process started from file.',
      statusUrl: `/jobs/${newJobId}/status`,
      resultUrl: `/jobs/${newJobId}/result`,
    };
  }

  @Post('generate-from-job')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Generate CSV Inventory Report from Schema Job',
    description: `Starts an asynchronous job to generate a detailed CSV inventory of an Airtable base schema.

## How It Works

1.  Provide the \`jobId\` of a previously completed \`schema-extraction\` job.
2.  The system retrieves the extracted schema from that job.
3.  It processes the schema to generate a CSV file with a complete inventory of all tables and fields.
4.  The output is a new job that, once completed, will contain the CSV file.

## CSV Columns

- **Table Name**: The name of the table.
- **Is Primary Field**: Indicates if the field is the primary field of the table (Yes/No).
- **Link Type**: For 'multipleRecordLinks' fields, indicates if it allows single or multiple records (Single/Multiple). Empty for other field types.
- **Field Name**: The name of the field.
- **Field ID**: The unique Airtable field ID (e.g., 'fld...').
- **Field Type**: The Airtable field type (e.g., 'singleLineText', 'multipleRecordLinks').
- **Source Fields (for Lookups/Rollups)**: Details about the source of data for computed fields.
- **Formula (if applicable)**: The formula for 'formula' fields.
- **Formula Dependencies**: List of fields that the formula depends on.
- **Used By (count)**: A count of how many other fields reference this field.
- **Referenced By**: Details about what references this field or what this field references.
- **Description**: Business description of the field (only included if \`generateDescriptions\` is \`true\`). If a field already has a description in the schema, it will be used directly. If AI generation fails, a default description based on field type will be used.
- **Notes**: Additional relevant information.

## Optional Features

- **generateDescriptions**: If set to \`true\`, generates AI-powered business descriptions for each field using the same AI configuration as json-dbml endpoints. If a field already has a description in the schema, it will be used directly without regeneration. If AI generation fails, a default description based on field type will be used.
`,
  })
  @ApiBody({
    type: GenerateCsvReportDto,
    description: 'The job ID of the schema extraction to use as input.',
  })
  @ApiResponse({
    status: 202,
    description: 'CSV generation job accepted and processing started.',
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
  async generateCsvReport(@Body() csvReportDto: GenerateCsvReportDto) {
    const newJobId = this.jobService.createJob('csv-report-generation');

    setTimeout(() => {
      this.jobService.processAsyncJob(newJobId, async (updateProgress) => {
        try {
          return await this.csvReportService.generateReport(
            csvReportDto.jobId,
            updateProgress,
            csvReportDto.generateDescriptions || false,
          );
        } catch (error) {
          this.logger.error(`CSV Report generation failed for source job ${csvReportDto.jobId}: ${error.message}`);
          // Return a structured error to be stored in the job result
          return JSON.stringify({
            error: true,
            message: error.message,
            details: {
              sourceJobId: csvReportDto.jobId,
              timestamp: new Date().toISOString(),
              errorType: error.constructor.name
            }
          }, null, 2);
        }
      });
    }, 0);

    return {
      jobId: newJobId,
      status: 'pending',
      message: 'CSV report generation process started.',
      statusUrl: `/jobs/${newJobId}/status`,
      resultUrl: `/jobs/${newJobId}/result`,
    };
  }
}

