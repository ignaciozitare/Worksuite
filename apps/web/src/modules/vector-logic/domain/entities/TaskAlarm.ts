export interface TaskAlarm {
  id: string;
  taskId: string;
  userId: string;
  triggerAt: string;
  advanceMinutes: number;
  repetitions: number;
  firedCount: number;
  createdAt: string;
}
