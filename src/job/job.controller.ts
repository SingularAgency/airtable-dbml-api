import { Controller, Get, Param, Res, NotFoundException, Header } from '@nestjs/common';
import { JobService } from './job.service';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import * as fs from 'fs';

@ApiTags('jobs')
@Controller('jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Get(':id/status')
  @ApiOperation({ summary: 'Get job status' })
  @ApiParam({ name: 'id', description: 'Job ID' })
  @ApiResponse({
    status: 200,
    description: 'Job status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
        progress: { type: 'number' },
        description: { type: 'string' },
        jobType: { 
          type: 'string', 
          enum: ['schema-extraction', 'dbml-generation', 'airtable-documentation'],
          description: 'Type of job being processed'
        },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        completedAt: { type: 'string', format: 'date-time' },
        error: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  getJobStatus(@Param('id') id: string) {
    const job = this.jobService.getJob(id);
    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }
    return job;
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download job result' })
  @ApiParam({ name: 'id', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job result downloaded successfully' })
  @ApiResponse({ status: 404, description: 'Job not found or not completed' })
  @Header('Content-Type', 'application/octet-stream')
  @Header('Content-Disposition', 'attachment; filename="output.dbml"')
  downloadJobResult(@Param('id') id: string, @Res() res: Response) {
    const job = this.jobService.getJob(id);
    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }
    
    if (job.status !== 'completed') {
      throw new NotFoundException(
        `Job is not completed yet. Current status: ${job.status}, progress: ${job.progress}%`,
      );
    }

    const filePath = this.jobService.getJobResultPath(id);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Result file for job ${id} not found`);
    }

    res.download(filePath);
  }
}
