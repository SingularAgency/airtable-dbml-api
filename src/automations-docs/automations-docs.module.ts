import { Module } from '@nestjs/common';
import { AutomationsDocsController } from './automations-docs.controller';
import { AutomationsDocsService } from './automations-docs.service';
import { JobModule } from '../job/job.module';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [JobModule, GeminiModule],
  controllers: [AutomationsDocsController],
  providers: [AutomationsDocsService],
})
export class AutomationsDocsModule {}
