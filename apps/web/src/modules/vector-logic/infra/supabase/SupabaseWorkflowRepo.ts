import type { SupabaseClient } from '@supabase/supabase-js';
import type { IWorkflowRepo } from '../../domain/ports/IWorkflowRepo';
import type { Workflow } from '../../domain/entities/Workflow';

export class SupabaseWorkflowRepo implements IWorkflowRepo {
  constructor(private sb: SupabaseClient) {}

  async findAll(): Promise<Workflow[]> {
    const { data, error } = await this.sb
      .from('vl_workflows')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(this.toDomain);
  }

  async findById(id: string): Promise<Workflow | null> {
    const { data, error } = await this.sb
      .from('vl_workflows')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return this.toDomain(data);
  }

  async create(draft: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    const { data, error } = await this.sb
      .from('vl_workflows')
      .insert({
        name: draft.name,
        description: draft.description,
        is_published: draft.isPublished,
        created_by: draft.createdBy,
      })
      .select()
      .single();
    if (error) throw error;
    return this.toDomain(data);
  }

  async update(id: string, patch: Partial<Workflow>): Promise<void> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.isPublished !== undefined) row.is_published = patch.isPublished;
    const { error } = await this.sb.from('vl_workflows').update(row).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_workflows').delete().eq('id', id);
    if (error) throw error;
  }

  private toDomain(row: any): Workflow {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      isPublished: row.is_published,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
