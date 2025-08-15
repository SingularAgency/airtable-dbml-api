import { Module } from '@nestjs/common';
import { SchemaExtractorController } from './schema-extractor.controller';
import { SchemaExtractorService } from './schema-extractor.service';
import { JobModule } from '../job/job.module';

@Module({
  imports: [JobModule],
  controllers: [SchemaExtractorController],
  providers: [SchemaExtractorService],
})
export class SchemaExtractorModule {}
