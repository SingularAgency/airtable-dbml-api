import { Module } from '@nestjs/common';
import { CsvReportController } from './csv-report.controller';
import { CsvReportService } from './csv-report.service';
import { JobModule } from '../job/job.module';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [JobModule, GeminiModule],
  controllers: [CsvReportController],
  providers: [CsvReportService],
})
export class CsvReportModule {}

