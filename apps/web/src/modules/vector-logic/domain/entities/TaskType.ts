export interface TaskType {
  id: string;
  name: string;
  icon: string | null;
  prefix: string | null;
  nextNumber: number;
  workflowId: string | null;
  schema: unknown[];
  createdAt: string;
  updatedAt: string;
}
