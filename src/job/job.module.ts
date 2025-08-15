import { Module } from '@nestjs/common';
import { JobService } from './job.service';
import { JobController } from './job.controller';
import { JobGateway } from './job.gateway';

@Module({
  providers: [JobService, JobGateway],
  controllers: [JobController],
  exports: [JobService],
})
export class JobModule {}
