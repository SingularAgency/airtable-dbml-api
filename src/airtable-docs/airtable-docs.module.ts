import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AirtableDocsController } from './airtable-docs.controller';
import { AirtableDocsService } from './airtable-docs.service';
import { JobModule } from '../job/job.module';

@Module({
  imports: [
    JobModule,
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max tamaño de archivo
      },
    }),
  ],
  controllers: [AirtableDocsController],
  providers: [AirtableDocsService],
})
export class AirtableDocsModule {}
