import { Module } from '@nestjs/common';
import { DbmlToCsvController } from './dbml-to-csv.controller';
import { DbmlToCsvService } from './dbml-to-csv.service';
import { JobModule } from '../job/job.module';

@Module({
  imports: [JobModule],
  controllers: [DbmlToCsvController],
  providers: [DbmlToCsvService],
})
export class DbmlToCsvModule {}
