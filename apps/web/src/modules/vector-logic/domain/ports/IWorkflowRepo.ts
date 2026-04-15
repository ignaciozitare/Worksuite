import type { Workflow } from '../entities/Workflow';

export interface IWorkflowRepo {
  findAll(): Promise<Workflow[]>;
  findById(id: string): Promise<Workflow | null>;
  create(draft: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow>;
  update(id: string, patch: Partial<Workflow>): Promise<void>;
  remove(id: string): Promise<void>;
}
