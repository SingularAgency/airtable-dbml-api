export interface Project {
    id: string;
    name: string;
    owner: string;
    auditDate: string;
    techDebt: number;
    bestPractices: number;
    status: AuditStatus;
}

export type AuditStatus = 'Done' | 'In Progress' | 'Error' | 'Pending'; 