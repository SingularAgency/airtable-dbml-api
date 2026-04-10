import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as Papa from 'papaparse';
import { JobService } from '../job/job.service';

// Basic representation of Airtable schema structures
interface AirtableTable {
  id: string;
  name: string;
  views?: AirtableView[];
}

interface AirtableView {
  id: string;
  name: string;
  type: string;
}

interface AirtableSchema {
  tables: AirtableTable[];
}

interface CsvRow {
  'Table Name': string;
  'View Name': string;
  'View Type': string;
}

@Injectable()
export class ViewsReportService {
  private readonly logger = new Logger(ViewsReportService.name);

  constructor(
    private readonly jobService: JobService,
  ) {}

  async generateReport(
    sourceJobId: string,
    baseId: string,
    accessToken: string,
    updateProgress: (progress: number, description?: string) => void,
  ): Promise<string> {
    this.logger.log(`Starting Views report generation from source job: ${sourceJobId}`);
    updateProgress(10, `Fetching source job ${sourceJobId}`);

    const sourceJob = this.jobService.getJob(sourceJobId);
    if (!sourceJob) {
      throw new NotFoundException(`Source job with ID ${sourceJobId} not found.`);
    }
    if (sourceJob.status !== 'completed') {
      throw new BadRequestException(`Source job ${sourceJobId} is not completed. Current status: ${sourceJob.status}`);
    }
    if (sourceJob.jobType !== 'schema-extraction') {
      throw new BadRequestException(`Source job ${sourceJobId} is not a 'schema-extraction' job. Job type: ${sourceJob.jobType}`);
    }

    const schemaPath = this.jobService.getJobResultPath(sourceJobId);
    if (!schemaPath) {
      throw new NotFoundException(`Result file for job ${sourceJobId} not found.`);
    }

    updateProgress(20, 'Reading schema file');
    const schemaContent = await fs.readFile(schemaPath, 'utf-8');
    const schema: AirtableSchema = JSON.parse(schemaContent);

    // Note: baseId and accessToken are kept for API compatibility but not used
    // since we only use data from the JSON export which contains id, name, and type

    return this.processSchemaToCsv(schema, baseId, accessToken, updateProgress, 20);
  }

  async generateReportFromFile(
    fileContent: string,
    baseId: string,
    accessToken: string,
    updateProgress: (progress: number, description?: string) => void,
  ): Promise<string> {
    this.logger.log(`Starting Views report generation from file content.`);
    updateProgress(10, `Parsing schema file`);

    try {
      const schema: AirtableSchema = JSON.parse(fileContent);

      // Note: baseId and accessToken are kept for API compatibility but not used
      // since we only use data from the JSON export which contains id, name, and type

      return this.processSchemaToCsv(schema, baseId, accessToken, updateProgress, 10);
    } catch (error) {
      this.logger.error('Failed to parse or process the provided file.', error.stack);
      throw new BadRequestException('Invalid file content. The file must be a valid JSON schema exported from Airtable.');
    }
  }

  /**
   * Common processing logic for converting Airtable schema to Views CSV.
   * @param schema The parsed Airtable schema
   * @param baseId The Airtable base ID (not used, kept for compatibility)
   * @param accessToken The Airtable access token (not used, kept for compatibility)
   * @param updateProgress Progress callback function
   * @param initialProgress Starting progress value
   * @returns The generated CSV string
   */
  private async processSchemaToCsv(
    schema: AirtableSchema,
    baseId: string,
    accessToken: string,
    updateProgress: (progress: number, description?: string) => void,
    initialProgress: number = 10,
  ): Promise<string> {
    this.logger.log('Processing views from schema...');
    updateProgress(initialProgress + 10, 'Processing views from schema');

    const csvData: CsvRow[] = [];
    const totalTables = schema.tables.length;
    let processedTables = 0;

    // Process each table
    for (const table of schema.tables) {
      const progress = initialProgress + 10 + Math.floor((processedTables / totalTables) * 80);
      updateProgress(progress, `Processing views for table: ${table.name}`);

      // Process views from the JSON schema
      if (table.views && table.views.length > 0) {
        for (const view of table.views) {
          csvData.push({
            'Table Name': table.name,
            'View Name': view.name,
            'View Type': view.type || 'grid',
          });
        }
        this.logger.log(`Found ${table.views.length} views for table ${table.name}`);
      }

      processedTables++;
    }

    updateProgress(initialProgress + 95, 'Generating CSV file');
    this.logger.log(`Generated ${csvData.length} view rows`);

    // Generate CSV
    const csv = Papa.unparse(csvData, {
      header: true,
      skipEmptyLines: false,
    });

    updateProgress(100, 'Views report generation completed');
    return csv;
  }
}
