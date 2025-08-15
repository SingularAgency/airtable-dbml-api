import { AuditStatus } from './project';

export interface Job {
    id: string;
    projectId: string;
    status: AuditStatus;
    createdAt: string;
    updatedAt: string;
    metrics?: JobMetrics;
}

export interface JobUpdate {
    id: string;
    projectId: string;
    status: AuditStatus;
    metrics?: JobMetrics;
}

export interface JobMetrics {
    techDebt: number;
    bestPractices: number;
    completionPercentage?: number;
} 