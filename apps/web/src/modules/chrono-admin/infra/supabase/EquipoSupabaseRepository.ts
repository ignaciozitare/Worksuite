// @ts-nocheck
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IEquipoRepository } from '../../domain/ports/IEquipoRepository';
import type { Equipo } from '../../domain/entities/Equipo';

export class EquipoSupabaseRepository implements IEquipoRepository {
  constructor(private db: SupabaseClient) {}

  async getAll(): Promise<Equipo[]> {
    const { data: equipos, error } = await this.db
      .from('ch_equipos')
      .select('*')
      .order('nombre');
    if (error) throw error;

    if (!equipos || equipos.length === 0) return [];

    const equipoIds = equipos.map((e: any) => e.id);

    const { data: miembrosRaw, error: mErr } = await this.db
      .from('ch_equipo_miembros')
      .select('equipo_id, user_id')
      .in('equipo_id', equipoIds);
    if (mErr) throw mErr;

    const userIds = [...new Set((miembrosRaw ?? []).map((m: any) => m.user_id))];

    let userMap = new Map<string, { name: string; email: string }>();
    if (userIds.length > 0) {
      const { data: users, error: uErr } = await this.db
        .from('users')
        .select('id, name, email')
        .in('id', userIds);
      if (uErr) throw uErr;
      userMap = new Map((users ?? []).map((u: any) => [u.id, { name: u.name, email: u.email }]));
    }

    const miembrosByEquipo = new Map<string, { userId: string; nombre: string; email: string }[]>();
    for (const m of miembrosRaw ?? []) {
      const user = userMap.get(m.user_id);
      const arr = miembrosByEquipo.get(m.equipo_id) ?? [];
      arr.push({
        userId: m.user_id,
        nombre: user?.name ?? user?.email ?? 'Desconocido',
        email: user?.email ?? '',
      });
      miembrosByEquipo.set(m.equipo_id, arr);
    }

    return equipos.map((row: any) => ({
      id: row.id,
      nombre: row.nombre,
      descripcion: row.descripcion ?? null,
      managerId: row.manager_id ?? null,
      allowedBookingZones: row.allowed_booking_zones ?? null,
      miembros: miembrosByEquipo.get(row.id) ?? [],
    }));
  }

  async create(nombre: string, descripcion?: string, managerId?: string): Promise<Equipo> {
    const { data, error } = await this.db
      .from('ch_equipos')
      .insert({
        nombre,
        descripcion: descripcion ?? null,
        manager_id: managerId ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    return {
      id: data.id,
      nombre: data.nombre,
      descripcion: data.descripcion ?? null,
      managerId: data.manager_id ?? null,
      allowedBookingZones: data.allowed_booking_zones ?? null,
      miembros: [],
    };
  }

  async update(id: string, data: Partial<Pick<Equipo, 'nombre' | 'descripcion' | 'managerId' | 'allowedBookingZones'>>): Promise<void> {
    const payload: Record<string, any> = {};
    if (data.nombre !== undefined) payload.nombre = data.nombre;
    if (data.descripcion !== undefined) payload.descripcion = data.descripcion;
    if (data.managerId !== undefined) payload.manager_id = data.managerId;
    if (data.allowedBookingZones !== undefined) payload.allowed_booking_zones = data.allowedBookingZones;

    const { error } = await this.db
      .from('ch_equipos')
      .update(payload)
      .eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error: mErr } = await this.db
      .from('ch_equipo_miembros')
      .delete()
      .eq('equipo_id', id);
    if (mErr) throw mErr;

    const { error } = await this.db
      .from('ch_equipos')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  async addMiembro(equipoId: string, userId: string): Promise<void> {
    const { error } = await this.db
      .from('ch_equipo_miembros')
      .insert({ equipo_id: equipoId, user_id: userId });
    if (error) throw error;
  }

  async removeMiembro(equipoId: string, userId: string): Promise<void> {
    const { error } = await this.db
      .from('ch_equipo_miembros')
      .delete()
      .eq('equipo_id', equipoId)
      .eq('user_id', userId);
    if (error) throw error;
  }
}
