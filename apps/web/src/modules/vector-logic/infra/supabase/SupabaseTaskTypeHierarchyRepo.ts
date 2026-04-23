import type { SupabaseClient } from '@supabase/supabase-js';
import type { ITaskTypeHierarchyRepo } from '../../domain/ports/ITaskTypeHierarchyRepo';
import type { TaskTypeHierarchy } from '../../domain/entities/TaskTypeHierarchy';

export class SupabaseTaskTypeHierarchyRepo implements ITaskTypeHierarchyRepo {
  constructor(private sb: SupabaseClient) {}

  async listAll(): Promise<TaskTypeHierarchy[]> {
    const { data, error } = await this.sb.from('vl_task_type_hierarchy').select('*');
    if (error) throw error;
    return (data ?? []).map((row) => this.toDomain(row));
  }

  async listChildrenOfType(parentTypeId: string): Promise<TaskTypeHierarchy[]> {
    const { data, error } = await this.sb
      .from('vl_task_type_hierarchy')
      .select('*')
      .eq('parent_type_id', parentTypeId);
    if (error) throw error;
    return (data ?? []).map((row) => this.toDomain(row));
  }

  async create(draft: Omit<TaskTypeHierarchy, 'id' | 'createdAt'>): Promise<TaskTypeHierarchy> {
    const { data, error } = await this.sb
      .from('vl_task_type_hierarchy')
      .insert({
        parent_type_id: draft.parentTypeId,
        child_type_id: draft.childTypeId,
      })
      .select()
      .single();
    if (error) throw error;
    return this.toDomain(data);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_task_type_hierarchy').delete().eq('id', id);
    if (error) throw error;
  }

  private toDomain(row: any): TaskTypeHierarchy {
    return {
      id: row.id,
      parentTypeId: row.parent_type_id,
      childTypeId: row.child_type_id,
      createdAt: row.created_at,
    };
  }
}
