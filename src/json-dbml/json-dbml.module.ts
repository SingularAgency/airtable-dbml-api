import { Module } from '@nestjs/common';
import { JsonDbmlController } from './json-dbml.controller';
import { JsonDbmlService } from './json-dbml.service';
import { GeminiModule } from '../gemini/gemini.module';
import { JobModule } from '../job/job.module';

@Module({
  imports: [GeminiModule, JobModule],
  controllers: [JsonDbmlController],
  providers: [JsonDbmlService],
  exports: [JsonDbmlService],
})
export class JsonDbmlModule {}
