import { Controller, Post, Body, HttpCode, Logger, UseInterceptors, UploadedFile, BadRequestException, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { JobService } from '../job/job.service';
import { ViewsReportService } from './views-report.service';
import { GenerateViewsReportDto } from './dto/generate-views-report.dto';

@ApiTags('views-report')
@Controller('views-report')
export class ViewsReportController {
  private readonly logger = new Logger(ViewsReportController.name);

  constructor(
    private readonly viewsReportService: ViewsReportService,
    private readonly jobService: JobService,
  ) {}

  @Post('generate-from-file')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Generate CSV Views Report from an uploaded Airtable schema file',
    description: `Starts an asynchronous job to generate a CSV report of all views in an Airtable base by uploading an Airtable schema JSON file.

## How It Works

1. Upload a JSON file containing the schema definition previously extracted from Airtable.
2. The system processes the schema and extracts view information from each table.
3. The output is a new job that, once completed, will contain the CSV file with all views information.

## CSV Columns

- **Table Name**: The name of the table containing the view.
- **View Name**: The name of the view.
- **View Type**: The type of view (grid, kanban, form, calendar, gallery, etc.).

## Note

The JSON export from Airtable only includes basic view information (id, name, type). Additional details like filters, groups, sorts, and field visibility are not available in the exported schema.
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
      },
    },
  })
  @ApiResponse({ status: 202, description: 'Views report generation job accepted and processing started.' })
  @ApiResponse({ status: 400, description: 'No file uploaded or invalid parameters.' })
  async generateViewsReportFromFile(
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Please upload a file with the key "file".');
    }

    const newJobId = this.jobService.createJob('views-report-generation');
    const fileContent = file.buffer.toString('utf-8');

    setTimeout(() => {
      this.jobService.processAsyncJob(newJobId, async (updateProgress) => {
        try {
          return await this.viewsReportService.generateReportFromFile(
            fileContent,
            '', // baseId not used
            '', // accessToken not used
            updateProgress,
          );
        } catch (error) {
          this.logger.error(`Views Report generation failed from file upload: ${error.message}`);
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
      message: 'Views report generation process started from file.',
      statusUrl: `/jobs/${newJobId}/status`,
      resultUrl: `/jobs/${newJobId}/result`,
    };
  }

  @Post('generate-from-job')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Generate CSV Views Report from Schema Job',
    description: `Starts an asynchronous job to generate a CSV report of all views in an Airtable base.

## How It Works

1. Provide the \`jobId\` of a previously completed \`schema-extraction\` job.
2. The system retrieves the extracted schema from that job.
3. It processes each table and extracts view information from the schema.
4. The output is a new job that, once completed, will contain the CSV file with all views information.

## CSV Columns

- **Table Name**: The name of the table containing the view.
- **View Name**: The name of the view.
- **View Type**: The type of view (grid, kanban, form, calendar, gallery, etc.).

## Note

The JSON export from Airtable only includes basic view information (id, name, type). Additional details like filters, groups, sorts, and field visibility are not available in the exported schema.
`,
  })
  @ApiBody({
    type: GenerateViewsReportDto,
    description: 'The job ID of the schema extraction, Base ID, and Access Token.',
  })
  @ApiResponse({
    status: 202,
    description: 'Views report generation job accepted and processing started.',
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
  async generateViewsReport(@Body() viewsReportDto: GenerateViewsReportDto) {
    const newJobId = this.jobService.createJob('views-report-generation');

    setTimeout(() => {
      this.jobService.processAsyncJob(newJobId, async (updateProgress) => {
        try {
          return await this.viewsReportService.generateReport(
            viewsReportDto.jobId,
            viewsReportDto.baseId || '',
            viewsReportDto.accessToken || '',
            updateProgress,
          );
        } catch (error) {
          this.logger.error(`Views Report generation failed for source job ${viewsReportDto.jobId}: ${error.message}`);
          return JSON.stringify({
            error: true,
            message: error.message,
            details: {
              sourceJobId: viewsReportDto.jobId,
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
      message: 'Views report generation process started.',
      statusUrl: `/jobs/${newJobId}/status`,
      resultUrl: `/jobs/${newJobId}/result`,
    };
  }
}
