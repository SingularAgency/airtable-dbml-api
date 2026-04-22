import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JsonDbmlModule } from './json-dbml/json-dbml.module';
import { GeminiModule } from './gemini/gemini.module';
import { JobModule } from './job/job.module';
import { AirtableDocsModule } from './airtable-docs/airtable-docs.module';
import { SchemaExtractorModule } from './schema-extractor/schema-extractor.module';
import { CsvReportModule } from './csv-report/csv-report.module';
import { ViewsReportModule } from './views-report/views-report.module';
import { SmartSheetDbmlModule } from './smartsheet-dbml/smartsheet-dbml.module';
import { DbmlToCsvModule } from './dbml-to-csv/dbml-to-csv.module';
import { AutomationsDocsModule } from './automations-docs/automations-docs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    JsonDbmlModule,
    GeminiModule,
    JobModule,
    AirtableDocsModule,
    SchemaExtractorModule,
    CsvReportModule,
    ViewsReportModule,
    SmartSheetDbmlModule,
    DbmlToCsvModule,
    AutomationsDocsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
