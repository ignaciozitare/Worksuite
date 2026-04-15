export interface Transition {
  id: string;
  workflowId: string;
  fromStateId: string;
  toStateId: string;
  isGlobal: boolean;
  label: string | null;
}
