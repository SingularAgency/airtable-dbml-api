import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { SmartSheetDbmlController } from './smartsheet-dbml.controller';
import { SmartSheetDbmlService } from './smartsheet-dbml.service';
import { JobModule } from '../job/job.module';
import { JsonDbmlModule } from '../json-dbml/json-dbml.module';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [
    JobModule,
    JsonDbmlModule,
    GeminiModule,
    MulterModule.register({
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max file size for SmartSheet JSON files
      },
    }),
  ],
  controllers: [SmartSheetDbmlController],
  providers: [SmartSheetDbmlService],
  exports: [SmartSheetDbmlService],
})
export class SmartSheetDbmlModule {}
