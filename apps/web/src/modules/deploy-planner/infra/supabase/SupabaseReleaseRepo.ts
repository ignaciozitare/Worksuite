import type { SupabaseClient } from '@supabase/supabase-js';
import type { IReleaseRepo }   from '../../domain/ports/IReleaseRepo';
import type { Release, ReleaseStatus, ReleaseConfig } from '../../domain/entities/Release';

// ── Mappers snake_case ↔ camelCase ────────────────────────────────────────────
const toRelease = (r: any): Release => ({
  id:             r.id,
  releaseNumber:  r.release_number,
  description:    r.description ?? null,
  status:         r.status,
  startDate:      r.start_date ?? null,
  endDate:        r.end_date ?? null,
  ticketIds:      r.ticket_ids ?? [],
  ticketStatuses: r.ticket_statuses ?? {},
  createdBy:      r.created_by ?? null,
  createdAt:      r.created_at,
  updatedAt:      r.updated_at,
});

const fromRelease = (r: Partial<Release>) => ({
  ...(r.releaseNumber  !== undefined && { release_number:   r.releaseNumber }),
  ...(r.description    !== undefined && { description:      r.description }),
  ...(r.status         !== undefined && { status:           r.status }),
  ...(r.startDate      !== undefined && { start_date:       r.startDate }),
  ...(r.endDate        !== undefined && { end_date:         r.endDate }),
  ...(r.ticketIds      !== undefined && { ticket_ids:       r.ticketIds }),
  ...(r.ticketStatuses !== undefined && { ticket_statuses:  r.ticketStatuses }),
  ...(r.createdBy      !== undefined && { created_by:       r.createdBy }),
});

const toStatus = (r: any): ReleaseStatus => ({
  id:      r.id,
  name:    r.name,
  color:   r.color,
  bgColor: r.bg_color,
  border:  r.border,
  ord:     r.ord,
  isFinal: r.is_final,
});

const toConfig = (r: any): ReleaseConfig => ({
  id:            r.id,
  prefix:        r.prefix ?? 'v',
  segments:      r.segments,
  separator:     r.separator ?? '.',
  nextNumber:    r.next_number ?? 1,
  locked:        r.locked ?? false,
  repoJiraField: r.repo_jira_field ?? '',
});

export class SupabaseReleaseRepo implements IReleaseRepo {
  constructor(private db: SupabaseClient) {}

  async getAll(): Promise<Release[]> {
    const { data, error } = await this.db
      .from('dp_releases')
      .select('*')
      .order('created_at', { ascending: false });
    if(error) throw error;
    return (data ?? []).map(toRelease);
  }

  async getStatuses(): Promise<ReleaseStatus[]> {
    const { data, error } = await this.db
      .from('dp_release_statuses')
      .select('*')
      .order('ord');
    if(error) throw error;
    return (data ?? []).map(toStatus);
  }

  async getConfig(): Promise<ReleaseConfig | null> {
    const { data, error } = await this.db
      .from('dp_version_config')
      .select('*')
      .limit(1)
      .single();
    if(error) return null;
    return toConfig(data);
  }

  async create(data: Omit<Release, 'id' | 'createdAt' | 'updatedAt'>): Promise<Release> {
    const { data: row, error } = await this.db
      .from('dp_releases')
      .insert(fromRelease(data))
      .select()
      .single();
    if(error) throw error;
    return toRelease(row);
  }

  async update(id: string, patch: Partial<Release>): Promise<void> {
    const { error } = await this.db
      .from('dp_releases')
      .update(fromRelease(patch))
      .eq('id', id);
    if(error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('dp_releases').delete().eq('id', id);
    if(error) throw error;
  }

  async updateTicketStatuses(id: string, map: Record<string, string>): Promise<void> {
    const { error } = await this.db
      .from('dp_releases')
      .update({ ticket_statuses: map })
      .eq('id', id);
    if(error) throw error;
  }

  async saveConfig(patch: Partial<ReleaseConfig>): Promise<void> {
    const dbPatch: any = {};
    if(patch.repoJiraField !== undefined) dbPatch.repo_jira_field = patch.repoJiraField;
    if(patch.nextNumber    !== undefined) dbPatch.next_number     = patch.nextNumber;
    if(patch.prefix        !== undefined) dbPatch.prefix          = patch.prefix;
    if(patch.locked        !== undefined) dbPatch.locked          = patch.locked;
    const { error } = await this.db.from('dp_version_config').update(dbPatch).eq('locked', false);
    if(error) throw error;
  }
}
