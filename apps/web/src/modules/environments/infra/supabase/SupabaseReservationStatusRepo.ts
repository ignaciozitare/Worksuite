import type { SupabaseClient } from '@supabase/supabase-js';
import type { IReservationStatusRepo } from '../../domain/ports/IReservationStatusRepo';
import type { ReservationStatusData } from '../../domain/entities/ReservationStatus';

export class SupabaseReservationStatusRepo implements IReservationStatusRepo {
  constructor(private readonly db: SupabaseClient) {}

  async findAll(): Promise<ReservationStatusData[]> {
    const { data, error } = await this.db
      .from('syn_reservation_statuses')
      .select('*')
      .order('ord');
    if (error) throw error;
    return (data || []) as ReservationStatusData[];
  }

  async create(input: Omit<ReservationStatusData, 'id'>): Promise<ReservationStatusData> {
    const { data, error } = await this.db
      .from('syn_reservation_statuses')
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data as ReservationStatusData;
  }

  async update(id: string, patch: Partial<ReservationStatusData>): Promise<void> {
    const { error } = await this.db
      .from('syn_reservation_statuses')
      .update(patch)
      .eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db
      .from('syn_reservation_statuses')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  async reorder(items: { id: string; ord: number }[]): Promise<void> {
    await Promise.all(
      items.map(s =>
        this.db.from('syn_reservation_statuses').update({ ord: s.ord }).eq('id', s.id),
      ),
    );
  }
}
