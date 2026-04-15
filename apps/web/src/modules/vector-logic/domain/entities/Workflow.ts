export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  isPublished: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
