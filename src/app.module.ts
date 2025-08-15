import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JsonDbmlModule } from './json-dbml/json-dbml.module';
import { GeminiModule } from './gemini/gemini.module';
import { JobModule } from './job/job.module';
import { AirtableDocsModule } from './airtable-docs/airtable-docs.module';
import { SchemaExtractorModule } from './schema-extractor/schema-extractor.module';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
