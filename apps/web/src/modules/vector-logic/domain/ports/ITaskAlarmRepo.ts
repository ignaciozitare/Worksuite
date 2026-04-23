import type { TaskAlarm } from '../entities/TaskAlarm';

export interface ITaskAlarmRepo {
  list(userId: string): Promise<TaskAlarm[]>;
  listByTask(taskId: string): Promise<TaskAlarm[]>;
  create(draft: Omit<TaskAlarm, 'id' | 'firedCount' | 'createdAt'>): Promise<TaskAlarm>;
  update(id: string, patch: Partial<TaskAlarm>): Promise<void>;
  remove(id: string): Promise<void>;
  markFired(id: string): Promise<void>;
}
