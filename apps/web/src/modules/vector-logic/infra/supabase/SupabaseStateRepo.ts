import type { SupabaseClient } from '@supabase/supabase-js';
import type { IStateRepo } from '../../domain/ports/IStateRepo';
import type { State, WorkflowState } from '../../domain/entities/State';

export class SupabaseStateRepo implements IStateRepo {
  constructor(private sb: SupabaseClient) {}

  async findAll(): Promise<State[]> {
    const { data, error } = await this.sb
      .from('vl_states')
      .select('*')
      .order('name');
    if (error) throw error;
    return (data ?? []).map(this.toState);
  }

  async create(draft: Omit<State, 'id' | 'createdAt'>): Promise<State> {
    const { data, error } = await this.sb
      .from('vl_states')
      .insert({
        name: draft.name,
        category: draft.category,
        color: draft.color,
        is_global: draft.isGlobal,
      })
      .select()
      .single();
    if (error) throw error;
    return this.toState(data);
  }

  async update(id: string, patch: Partial<State>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.category !== undefined) row.category = patch.category;
    if (patch.color !== undefined) row.color = patch.color;
    if (patch.isGlobal !== undefined) row.is_global = patch.isGlobal;
    const { error } = await this.sb.from('vl_states').update(row).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_states').delete().eq('id', id);
    if (error) throw error;
  }

  async findByWorkflow(workflowId: string): Promise<WorkflowState[]> {
    const { data, error } = await this.sb
      .from('vl_workflow_states')
      .select('*, state:vl_states(*)')
      .eq('workflow_id', workflowId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => this.toWorkflowState(row));
  }

  async findAllWorkflowStates(): Promise<WorkflowState[]> {
    const { data, error } = await this.sb
      .from('vl_workflow_states')
      .select('*, state:vl_states(*)')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => this.toWorkflowState(row));
  }

  async addToWorkflow(ws: Omit<WorkflowState, 'id'>): Promise<WorkflowState> {
    const { data, error } = await this.sb
      .from('vl_workflow_states')
      .insert({
        workflow_id: ws.workflowId,
        state_id: ws.stateId,
        position_x: ws.positionX,
        position_y: ws.positionY,
        is_initial: ws.isInitial,
        sort_order: ws.sortOrder ?? 0,
      })
      .select('*, state:vl_states(*)')
      .single();
    if (error) throw error;
    return this.toWorkflowState(data);
  }

  async updatePosition(id: string, x: number, y: number): Promise<void> {
    const { error } = await this.sb
      .from('vl_workflow_states')
      .update({ position_x: x, position_y: y })
      .eq('id', id);
    if (error) throw error;
  }

  async removeFromWorkflow(id: string): Promise<void> {
    const { error } = await this.sb.from('vl_workflow_states').delete().eq('id', id);
    if (error) throw error;
  }

  private toState(row: any): State {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      color: row.color,
      isGlobal: row.is_global,
      createdAt: row.created_at,
    };
  }

  private toWorkflowState(row: any): WorkflowState {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      stateId: row.state_id,
      positionX: row.position_x,
      positionY: row.position_y,
      isInitial: row.is_initial,
      sortOrder: row.sort_order ?? 0,
      state: row.state ? this.toState(row.state) : undefined,
    };
  }

  /** Persist a new column order for a list of workflow states. */
  async reorderWorkflowStates(updates: Array<{ id: string; sortOrder: number }>): Promise<void> {
    // Run updates in parallel; the table is small (a few states per workflow)
    // so a single batch is fine.
    await Promise.all(updates.map(({ id, sortOrder }) =>
      this.sb.from('vl_workflow_states').update({ sort_order: sortOrder }).eq('id', id),
    ));
  }
}
