import type { SupabaseClient } from '@supabase/supabase-js';
import type { ITaskAlarmRepo } from '../../domain/ports/ITaskAlarmRepo';
import type { TaskAlarm } from '../../domain/entities/TaskAlarm';

export class SupabaseTaskAlarmRepo implements ITaskAlarmRepo {
  constructor(private sb: SupabaseClient) {}

  async list(userId: string): Promise<TaskAlarm[]> {
    const { data, error } = await this.sb
      .from('vl_task_alarms')
      .select('*')
      .eq('user_id', userId)
      .order('trigger_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => this.toDomain(row));
  }

  async listByTask(taskId: string): Promise<TaskAlarm[]> {
    const { data, error } = await this.sb
      .from('vl_task_alarms')
      .select('*')
      .eq('task_id', taskId)
      .order('trigger_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => this.toDomain(row));
  }

  async create(draft: Omit<TaskAlarm, 'id' | 'firedCount' | 'createdAt'>): Promise<TaskAlarm> {
    const { data, error } = await this.sb
      .from('vl_task_alarms')
      .insert({
        task_id: draft.taskId,
        user_id: draft.userId,
        trigger_at: draft.triggerAt,
        advance_minutes: draft.advanceMinutes,
        repetitions: draft.repetitions,
      })
      .select()
      .single();
    if (error) throw error;
    return this.toDomain(data);
  }

  async update(id: string, patch: Partial<TaskAlarm>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.triggerAt !== undefined) row.trigger_at = patch.triggerAt;
    if (patch.advanceMinutes !== undefined) row.advance_minutes = patch.advanceMinutes;
    if (patch.repetitions !== undefined) row.repetitions = patch.repetitions;
    if (patch.firedCount !== undefined) row.fired_count = patch.firedCount;
    const { error } = await this.sb.from('vl_task_alarms').update(row).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_task_alarms').delete().eq('id', id);
    if (error) throw error;
  }

  async markFired(id: string): Promise<void> {
    const { data, error: readErr } = await this.sb
      .from('vl_task_alarms')
      .select('fired_count')
      .eq('id', id)
      .single();
    if (readErr) throw readErr;
    const { error } = await this.sb
      .from('vl_task_alarms')
      .update({ fired_count: (data?.fired_count ?? 0) + 1 })
      .eq('id', id);
    if (error) throw error;
  }

  private toDomain(row: any): TaskAlarm {
    return {
      id: row.id,
      taskId: row.task_id,
      userId: row.user_id,
      triggerAt: row.trigger_at,
      advanceMinutes: row.advance_minutes,
      repetitions: row.repetitions,
      firedCount: row.fired_count,
      createdAt: row.created_at,
    };
  }
}
