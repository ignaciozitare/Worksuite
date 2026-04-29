import type { SupabaseClient } from '@supabase/supabase-js';
import type { ITaskRepo } from '../../domain/ports/ITaskRepo';
import type { Task, TaskDraft } from '../../domain/entities/Task';

export class SupabaseTaskRepo implements ITaskRepo {
  constructor(private sb: SupabaseClient) {}

  async findByTaskType(taskTypeId: string): Promise<Task[]> {
    const { data, error } = await this.sb
      .from('vl_tasks')
      .select('*')
      .eq('task_type_id', taskTypeId)
      .is('archived_at', null)
      .order('sort_order', { ascending: true })
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => this.toDomain(row));
  }

  /** Find ALL live (non-archived) tasks across task types — used by the unified Kanban view */
  async findAll(): Promise<Task[]> {
    const { data, error } = await this.sb
      .from('vl_tasks')
      .select('*')
      .is('archived_at', null)
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

  async findBacklog(): Promise<Task[]> {
    // Inner-join against vl_states to keep only rows whose state.category='BACKLOG'.
    const { data, error } = await this.sb
      .from('vl_tasks')
      .select('*, vl_states!inner(category)')
      .eq('vl_states.category', 'BACKLOG')
      .is('archived_at', null)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => this.toDomain(row));
  }

  async findArchived(): Promise<Task[]> {
    const { data, error } = await this.sb
      .from('vl_tasks')
      .select('*')
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => this.toDomain(row));
  }

  async findChildren(parentTaskId: string): Promise<Task[]> {
    const { data, error } = await this.sb
      .from('vl_tasks')
      .select('*')
      .eq('parent_task_id', parentTaskId)
      .is('archived_at', null)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => this.toDomain(row));
  }

  async create(draft: TaskDraft): Promise<Task> {
    // Auto-generate typed code (e.g. "BUG-0012") when the draft has none
    // and the task type has a prefix configured. The unique index on
    // vl_tasks.code protects against a rare race (two concurrent creates
    // for the same type) — in that case the second insert fails and the
    // caller may retry.
    let code: string | null = draft.code ?? null;
    let nextNumberToPersist: number | null = null;
    if (!code) {
      const { data: tt } = await this.sb
        .from('vl_task_types')
        .select('prefix, next_number')
        .eq('id', draft.taskTypeId)
        .single();
      if (tt?.prefix) {
        const n = tt.next_number ?? 1;
        code = `${tt.prefix}-${String(n).padStart(4, '0')}`;
        nextNumberToPersist = n + 1;
      }
    }

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
        code,
        start_date: draft.startDate ?? null,
        due_date: draft.dueDate ?? null,
        parent_task_id: draft.parentTaskId ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    if (nextNumberToPersist !== null) {
      // Best-effort: if this update fails the task is already created and
      // usable; the code field will just skip a number next time.
      await this.sb
        .from('vl_task_types')
        .update({ next_number: nextNumberToPersist })
        .eq('id', draft.taskTypeId);
    }

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
    if (patch.code !== undefined) row.code = patch.code;
    if (patch.startDate !== undefined) row.start_date = patch.startDate;
    if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
    if (patch.parentTaskId !== undefined) row.parent_task_id = patch.parentTaskId;
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

  async archive(id: string, userId: string): Promise<void> {
    const { error } = await this.sb
      .from('vl_tasks')
      .update({
        archived_at: new Date().toISOString(),
        archived_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
  }

  async reopen(id: string, stateId: string): Promise<void> {
    const { error } = await this.sb
      .from('vl_tasks')
      .update({
        archived_at: null,
        archived_by: null,
        state_id: stateId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_tasks').delete().eq('id', id);
    if (error) throw error;
  }

  private toDomain(row: any): Task {
    return {
      id: row.id,
      code: row.code ?? null,
      taskTypeId: row.task_type_id,
      stateId: row.state_id,
      title: row.title,
      data: row.data ?? {},
      assigneeId: row.assignee_id,
      priority: row.priority,
      startDate: row.start_date ?? null,
      dueDate: row.due_date ?? null,
      stateEnteredAt: row.state_entered_at ?? row.created_at,
      parentTaskId: row.parent_task_id ?? null,
      archivedAt: row.archived_at ?? null,
      archivedBy: row.archived_by ?? null,
      sortOrder: row.sort_order ?? 0,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
