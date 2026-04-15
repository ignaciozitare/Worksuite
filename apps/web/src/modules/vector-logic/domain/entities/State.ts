export type StateCategory = 'OPEN' | 'BACKLOG' | 'IN_PROGRESS' | 'DONE';

export interface State {
  id: string;
  name: string;
  category: StateCategory;
  color: string | null;
  isGlobal: boolean;
  createdAt: string;
}

export interface WorkflowState {
  id: string;
  workflowId: string;
  stateId: string;
  positionX: number;
  positionY: number;
  isInitial: boolean;
  state?: State;
}
