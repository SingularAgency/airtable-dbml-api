import { Module } from '@nestjs/common';
import { ViewsReportController } from './views-report.controller';
import { ViewsReportService } from './views-report.service';
import { JobModule } from '../job/job.module';

@Module({
  imports: [JobModule],
  controllers: [ViewsReportController],
  providers: [ViewsReportService],
})
export class ViewsReportModule {}
