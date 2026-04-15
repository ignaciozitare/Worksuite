import type { State, WorkflowState } from '../entities/State';

export interface IStateRepo {
  findAll(): Promise<State[]>;
  create(draft: Omit<State, 'id' | 'createdAt'>): Promise<State>;
  update(id: string, patch: Partial<State>): Promise<void>;
  remove(id: string): Promise<void>;

  findByWorkflow(workflowId: string): Promise<WorkflowState[]>;
  addToWorkflow(ws: Omit<WorkflowState, 'id'>): Promise<WorkflowState>;
  updatePosition(id: string, x: number, y: number): Promise<void>;
  removeFromWorkflow(id: string): Promise<void>;
  reorderWorkflowStates(updates: Array<{ id: string; sortOrder: number }>): Promise<void>;
}
