import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { JobGateway } from './job.gateway';

export type JobType = 'schema-extraction' | 'dbml-generation' | 'airtable-documentation' | 'csv-report-generation' | 'views-report-generation' | 'dbml-to-csv';

export interface JobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  description?: string;
  error?: string;
  jobType: JobType;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

@Injectable()
export class JobService {
  private jobs: Map<string, JobStatus> = new Map();
  private readonly outputDir: string;

  constructor(private jobGateway: JobGateway) {
    this.outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  createJob(jobType: JobType): string {
    const jobId = uuidv4();
    const job: JobStatus = {
      id: jobId,
      status: 'pending',
      progress: 0,
      jobType,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jobs.set(jobId, job);
    
    // Notificar creación del job
    this.jobGateway.notifyJobUpdate(jobId, {
      jobId,
      status: 'pending',
      jobType,
      event: 'job_created',
      timestamp: new Date().toISOString()
    });
    
    return jobId;
  }

  getJob(jobId: string): JobStatus | undefined {
    return this.jobs.get(jobId);
  }

  updateJobStatus(
    jobId: string,
    updates: Partial<Omit<JobStatus, 'id' | 'createdAt' | 'jobType'>>,
  ): JobStatus | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    Object.assign(job, updates, { updatedAt: new Date() });
    if (updates.status === 'completed') {
      job.completedAt = new Date();
    }
    this.jobs.set(jobId, job);
    
    // Notificar actualización del job
    this.jobGateway.notifyJobUpdate(jobId, {
      jobId,
      ...updates,
      jobType: job.jobType,
      event: 'status_update',
      timestamp: new Date().toISOString()
    });
    
    return job;
  }

  private getResultFileExtension(jobType: JobType): string {
    switch (jobType) {
      case 'csv-report-generation':
      case 'views-report-generation':
      case 'dbml-to-csv':
        return 'csv';
      case 'schema-extraction':
        return 'json'; // Schema is stored as JSON
      case 'dbml-generation':
      case 'airtable-documentation':
      default:
        return 'dbml';
    }
  }

  storeJobResult(jobId: string, content: string): string {
    const job = this.jobs.get(jobId);
    if (!job) {
      // Fallback or error
      const filePath = path.join(this.outputDir, `${jobId}.txt`);
      fs.writeFileSync(filePath, content, 'utf8');
      return filePath;
    }

    const extension = this.getResultFileExtension(job.jobType);
    const filePath = path.join(this.outputDir, `${jobId}.${extension}`);
    fs.writeFileSync(filePath, content, 'utf8');
    
    // Notificar que hay un resultado disponible
    this.jobGateway.notifyJobUpdate(jobId, {
      jobId,
      status: 'completed',
      jobType: job.jobType,
      event: 'result_ready',
      resultUrl: `/api/jobs/${jobId}/result`,
      timestamp: new Date().toISOString()
    });
    
    return filePath;
  }

  getJobResultPath(jobId: string): string | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    const extension = this.getResultFileExtension(job.jobType);
    const filePath = path.join(this.outputDir, `${jobId}.${extension}`);

    // Check if the file actually exists before returning the path
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    
    // For backwards compatibility, check for .dbml if the specific file isn't found
    const legacyPath = path.join(this.outputDir, `${jobId}.dbml`);
    if (fs.existsSync(legacyPath)) {
      return legacyPath;
    }

    return undefined; // Or return the expected path even if it doesn't exist yet
  }

  async processAsyncJob(
    jobId: string,
    processFn: (updateProgress: (progress: number, description?: string) => void) => Promise<string>,
  ): Promise<void> {
    const job = this.getJob(jobId);
    if (!job) return;

    try {
      this.updateJobStatus(jobId, { 
        status: 'processing', 
        progress: 0,
        description: 'Starting processing...' 
      });
      
      // Función para actualizar el progreso
      const updateProgress = (progress: number, description?: string) => {
        this.updateJobStatus(jobId, { 
          progress: Math.min(Math.max(0, progress), 100),
          description
        });
      };
      
      // Ejecutar el procesamiento
      const result = await processFn(updateProgress);
      
      // Guardar el resultado
      const filePath = this.storeJobResult(jobId, result);
      
      // Actualizar el estado del trabajo
      this.updateJobStatus(jobId, {
        status: 'completed',
        progress: 100,
        description: 'Processing completed successfully.'
      });
    } catch (error) {
      console.error('Job processing error:', error);
      this.updateJobStatus(jobId, {
        status: 'failed',
        progress: 0,
        description: 'Processing failed',
        error: error.message || 'Unknown error',
      });
    }
  }
}
