import type { SupabaseClient } from '@supabase/supabase-js';
import type { ITaskRepo } from '../../domain/ports/ITaskRepo';
import type { Task } from '../../domain/entities/Task';

export class SupabaseTaskRepo implements ITaskRepo {
  constructor(private sb: SupabaseClient) {}

  async findByTaskType(taskTypeId: string): Promise<Task[]> {
    const { data, error } = await this.sb
      .from('vl_tasks')
      .select('*')
      .eq('task_type_id', taskTypeId)
      .order('sort_order', { ascending: true })
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => this.toDomain(row));
  }

  /** Find ALL tasks across task types — used by the unified Kanban view */
  async findAll(): Promise<Task[]> {
    const { data, error } = await this.sb
      .from('vl_tasks')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => this.toDomain(row));
  }

  async findById(id: string): Promise<Task | null> {
    const { data, error } = await this.sb
      .from('vl_tasks')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return this.toDomain(data);
  }

  async create(draft: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const { data, error } = await this.sb
      .from('vl_tasks')
      .insert({
        task_type_id: draft.taskTypeId,
        state_id: draft.stateId,
        title: draft.title,
        data: draft.data,
        assignee_id: draft.assigneeId,
        priority: draft.priority,
        sort_order: draft.sortOrder ?? 0,
        created_by: draft.createdBy,
      })
      .select()
      .single();
    if (error) throw error;
    return this.toDomain(data);
  }

  async update(id: string, patch: Partial<Task>): Promise<void> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.data !== undefined) row.data = patch.data;
    if (patch.stateId !== undefined) row.state_id = patch.stateId;
    if (patch.assigneeId !== undefined) row.assignee_id = patch.assigneeId;
    if (patch.priority !== undefined) row.priority = patch.priority;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    const { error } = await this.sb.from('vl_tasks').update(row).eq('id', id);
    if (error) throw error;
  }

  async moveToState(id: string, stateId: string): Promise<void> {
    const { error } = await this.sb
      .from('vl_tasks')
      .update({ state_id: stateId, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  /** Bulk update sort_order for tasks (used after drag-and-drop reorder) */
  async reorder(updates: Array<{ id: string; sortOrder: number; stateId?: string | null }>): Promise<void> {
    await Promise.all(updates.map(({ id, sortOrder, stateId }) => {
      const row: Record<string, unknown> = { sort_order: sortOrder, updated_at: new Date().toISOString() };
      if (stateId !== undefined) row.state_id = stateId;
      return this.sb.from('vl_tasks').update(row).eq('id', id);
    }));
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_tasks').delete().eq('id', id);
    if (error) throw error;
  }

  private toDomain(row: any): Task {
    return {
      id: row.id,
      taskTypeId: row.task_type_id,
      stateId: row.state_id,
      title: row.title,
      data: row.data ?? {},
      assigneeId: row.assignee_id,
      priority: row.priority,
      sortOrder: row.sort_order ?? 0,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
