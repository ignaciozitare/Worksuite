// @ts-nocheck
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IEmpleadoConfigRepository } from '../../domain/ports/IEmpleadoConfigRepository';
import type { EmpleadoConfig } from '../../domain/entities/EmpleadoConfig';

function toEntity(row: any): EmpleadoConfig {
  return {
    id: row.id,
    userId: row.user_id,
    horasJornadaMinutos: row.horas_jornada_minutos ?? null,
    diasVacaciones: row.dias_vacaciones ?? null,
    jornadaDias: row.jornada_dias ?? [],
  };
}

export class EmpleadoConfigSupabaseRepository implements IEmpleadoConfigRepository {
  constructor(private db: SupabaseClient) {}

  async getByUserId(userId: string): Promise<EmpleadoConfig | null> {
    const { data, error } = await this.db
      .from('ch_empleado_config')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ? toEntity(data) : null;
  }

  async getAll(): Promise<EmpleadoConfig[]> {
    const { data, error } = await this.db
      .from('ch_empleado_config')
      .select('*');
    if (error) throw error;
    return (data ?? []).map(toEntity);
  }

  async upsert(userId: string, data: Partial<Omit<EmpleadoConfig, 'id' | 'userId'>>): Promise<EmpleadoConfig> {
    const payload: Record<string, any> = { user_id: userId };

    if (data.horasJornadaMinutos !== undefined) payload.horas_jornada_minutos = data.horasJornadaMinutos;
    if (data.diasVacaciones !== undefined) payload.dias_vacaciones = data.diasVacaciones;
    if (data.jornadaDias !== undefined) payload.jornada_dias = data.jornadaDias;

    const { data: row, error } = await this.db
      .from('ch_empleado_config')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;
    return toEntity(row);
  }
}
