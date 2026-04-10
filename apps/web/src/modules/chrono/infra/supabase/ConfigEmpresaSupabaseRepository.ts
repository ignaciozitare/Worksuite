// @ts-nocheck
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IConfigEmpresaRepository } from '../../domain/ports/IConfigEmpresaRepository';

export class ConfigEmpresaSupabaseRepository implements IConfigEmpresaRepository {
  constructor(private db: SupabaseClient) {}

  async getHorasJornadaMinutos(): Promise<number | null> {
    const { data, error } = await this.db
      .from('ch_config_empresa')
      .select('horas_jornada_minutos')
      .limit(1)
      .single();
    if (error) return null;
    return data?.horas_jornada_minutos ?? null;
  }
}
