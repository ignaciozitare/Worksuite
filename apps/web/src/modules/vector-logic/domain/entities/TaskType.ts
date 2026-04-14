export interface TaskType {
  id: string;
  name: string;
  icon: string | null;
  workflowId: string | null;
  schema: unknown[];
  createdAt: string;
  updatedAt: string;
}
