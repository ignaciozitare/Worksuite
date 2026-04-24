import type { SupabaseClient } from '@supabase/supabase-js';
import type { ITaskTypeRepo } from '../../domain/ports/ITaskTypeRepo';
import type { TaskType } from '../../domain/entities/TaskType';

export class SupabaseTaskTypeRepo implements ITaskTypeRepo {
  constructor(private sb: SupabaseClient) {}

  async findAll(): Promise<TaskType[]> {
    const { data, error } = await this.sb
      .from('vl_task_types')
      .select('*')
      .order('name');
    if (error) throw error;
    return (data ?? []).map(this.toDomain);
  }

  async create(draft: Omit<TaskType, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskType> {
    const { data, error } = await this.sb
      .from('vl_task_types')
      .insert({
        name: draft.name,
        icon: draft.icon,
        workflow_id: draft.workflowId,
        schema: draft.schema,
        prefix: draft.prefix,
        next_number: draft.nextNumber ?? 1,
      })
      .select()
      .single();
    if (error) throw error;
    return this.toDomain(data);
  }

  async update(id: string, patch: Partial<TaskType>): Promise<void> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.icon !== undefined) row.icon = patch.icon;
    if (patch.workflowId !== undefined) row.workflow_id = patch.workflowId;
    if (patch.schema !== undefined) row.schema = patch.schema;
    if (patch.prefix !== undefined) row.prefix = patch.prefix;
    if (patch.nextNumber !== undefined) row.next_number = patch.nextNumber;
    const { error } = await this.sb.from('vl_task_types').update(row).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_task_types').delete().eq('id', id);
    if (error) throw error;
  }

  private toDomain(row: any): TaskType {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      prefix: row.prefix ?? null,
      nextNumber: row.next_number ?? 1,
      workflowId: row.workflow_id,
      schema: row.schema ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
