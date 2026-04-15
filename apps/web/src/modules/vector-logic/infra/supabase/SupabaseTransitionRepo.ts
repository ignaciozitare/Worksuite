import type { SupabaseClient } from '@supabase/supabase-js';
import type { ITransitionRepo } from '../../domain/ports/ITransitionRepo';
import type { Transition } from '../../domain/entities/Transition';

export class SupabaseTransitionRepo implements ITransitionRepo {
  constructor(private sb: SupabaseClient) {}

  async findByWorkflow(workflowId: string): Promise<Transition[]> {
    const { data, error } = await this.sb
      .from('vl_transitions')
      .select('*')
      .eq('workflow_id', workflowId);
    if (error) throw error;
    return (data ?? []).map(this.toDomain);
  }

  async create(draft: Omit<Transition, 'id'>): Promise<Transition> {
    const { data, error } = await this.sb
      .from('vl_transitions')
      .insert({
        workflow_id: draft.workflowId,
        from_state_id: draft.fromStateId,
        to_state_id: draft.toStateId,
        is_global: draft.isGlobal,
        label: draft.label,
      })
      .select()
      .single();
    if (error) throw error;
    return this.toDomain(data);
  }

  async update(id: string, patch: Partial<Transition>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.label !== undefined) row.label = patch.label;
    if (patch.isGlobal !== undefined) row.is_global = patch.isGlobal;
    const { error } = await this.sb.from('vl_transitions').update(row).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_transitions').delete().eq('id', id);
    if (error) throw error;
  }

  private toDomain(row: any): Transition {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      fromStateId: row.from_state_id,
      toStateId: row.to_state_id,
      isGlobal: row.is_global,
      label: row.label,
    };
  }
}
