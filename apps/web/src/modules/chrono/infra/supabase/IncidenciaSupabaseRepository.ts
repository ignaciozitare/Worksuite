import type { SupabaseClient } from '@supabase/supabase-js';
import type { IIncidenciaRepository } from '../../domain/ports/IIncidenciaRepository';
import type { Incidencia, CategoriaIncidencia } from '../../domain/entities/Incidencia';

function toIncidencia(row: any): Incidencia {
  return {
    id: row.id, fichajeId: row.fichaje_id, userId: row.user_id,
    categoria: row.categoria, inicioAt: row.inicio_at, finAt: row.fin_at,
    descripcion: row.descripcion, adjuntoUrl: row.adjunto_url,
    estado: row.estado, aprobadoPor: row.aprobado_por, aprobadoAt: row.aprobado_at,
  };
}

export class IncidenciaSupabaseRepository implements IIncidenciaRepository {
  constructor(private db: SupabaseClient) {}

  async getIncidenciasMes(userId: string, mes: string): Promise<Incidencia[]> {
    const { data, error } = await this.db.from('ch_incidencias').select('*')
      .eq('user_id', userId)
      .gte('inicio_at', `${mes}-01T00:00:00`)
      .lt('inicio_at', (() => { const [y,m] = mes.split('-').map(Number) as [number,number]; const nm = m === 12 ? 1 : m + 1; const ny = m === 12 ? y + 1 : y; return `${ny}-${String(nm).padStart(2,'0')}-01T00:00:00`; })())
      .order('inicio_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toIncidencia);
  }

  async crear(data: {
    fichajeId: string;
    userId: string;
    categoria: CategoriaIncidencia;
    inicioAt: string;
    finAt?: string;
    descripcion?: string;
  }): Promise<Incidencia> {
    const { data: row, error } = await this.db.from('ch_incidencias').insert({
      fichaje_id: data.fichajeId,
      user_id: data.userId,
      categoria: data.categoria,
      inicio_at: data.inicioAt,
      fin_at: data.finAt ?? null,
      descripcion: data.descripcion ?? null,
    }).select().single();
    if (error) throw error;
    return toIncidencia(row);
  }

  async actualizar(
    id: string,
    data: Partial<Pick<Incidencia, 'finAt' | 'descripcion'>>,
  ): Promise<Incidencia> {
    const updates: Record<string, unknown> = {};
    if (data.finAt !== undefined) updates.fin_at = data.finAt;
    if (data.descripcion !== undefined) updates.descripcion = data.descripcion;
    const { data: row, error } = await this.db.from('ch_incidencias')
      .update(updates).eq('id', id).select().single();
    if (error) throw error;
    return toIncidencia(row);
  }

  async cancelar(id: string): Promise<void> {
    const { error } = await this.db.from('ch_incidencias').delete().eq('id', id);
    if (error) throw error;
  }
}
