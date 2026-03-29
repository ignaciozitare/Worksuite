import type { SupabaseClient }   from '@supabase/supabase-js';
import type { IEnvironmentRepo } from '../../domain/ports/IEnvironmentRepo';
import type { Environment }      from '../../domain/entities/Environment';

const toEnv = (r: any): Environment => ({
  id:                     r.id,
  name:                   r.name,
  category:               r.category,
  isLocked:               r.is_locked,
  isArchived:             r.is_archived,
  maxReservationDuration: r.max_reservation_duration,
  color:                  r.color ?? null,
  url:                    r.url ?? null,
});

const fromEnv = (e: Environment) => ({
  id:                         e.id,
  name:                       e.name,
  category:                   e.category,
  is_locked:                  e.isLocked,
  is_archived:                e.isArchived,
  max_reservation_duration:   e.maxReservationDuration,
  color:                      e.color,
  url:                        e.url,
});

export class SupabaseEnvironmentRepo implements IEnvironmentRepo {
  constructor(private db: SupabaseClient) {}

  async getAll(): Promise<Environment[]> {
    const { data, error } = await this.db.from('syn_environments').select('*');
    if (error) throw error;
    return (data ?? []).map(toEnv);
  }

  async create(env: Omit<Environment, 'id'>): Promise<Environment> {
    const id = Math.random().toString(36).slice(2, 10);
    const row = fromEnv({ ...env, id });
    const { data, error } = await this.db.from('syn_environments').insert(row).select().single();
    if (error) throw error;
    return toEnv(data);
  }

  async update(env: Environment): Promise<void> {
    const { error } = await this.db.from('syn_environments').update(fromEnv(env)).eq('id', env.id);
    if (error) throw error;
  }
}
