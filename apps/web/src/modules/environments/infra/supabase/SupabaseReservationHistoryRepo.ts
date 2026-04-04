import type { SupabaseClient } from '@supabase/supabase-js';
import type { IReservationHistoryRepo, ReservationHistoryEntry } from '../../domain/ports/IReservationHistoryRepo';

export class SupabaseReservationHistoryRepo implements IReservationHistoryRepo {
  constructor(private readonly db: SupabaseClient) {}

  async findRecent(months: number): Promise<ReservationHistoryEntry[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const { data, error } = await this.db
      .from('syn_reservation_history')
      .select('*')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async save(entry: Omit<ReservationHistoryEntry, 'id' | 'created_at'>): Promise<void> {
    const { error } = await this.db.from('syn_reservation_history').insert(entry);
    if (error) throw error;
  }
}
