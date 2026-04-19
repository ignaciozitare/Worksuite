import type { SupabaseClient }    from '@supabase/supabase-js';
import type { IReservationRepo }  from '../../domain/ports/IReservationRepo';
import type { Reservation, Repository, EnvPolicy } from '../../domain/entities/Reservation';
import type { ReservationStatusCategory } from '../../domain/entities/ReservationStatus';
import { ConflictError } from '../../../../shared/domain/errors/ConflictError';

// Shape of a row joined with syn_reservation_statuses.
type RowWithStatus = {
  id: string;
  environment_id: string;
  reserved_by_user_id: string;
  jira_issue_keys: string[] | null;
  description: string | null;
  planned_start: string;
  planned_end: string;
  status_id: string;
  selected_repository_ids: string[] | null;
  usage_session: any;
  policy_flags: any;
  extracted_repos: string[] | null;
  syn_reservation_statuses: {
    name: string;
    status_category: ReservationStatusCategory;
  } | null;
};

const toRes = (r: RowWithStatus): Reservation => ({
  id:                    r.id,
  environmentId:         r.environment_id,
  reservedByUserId:      r.reserved_by_user_id,
  jiraIssueKeys:         r.jira_issue_keys ?? [],
  description:           r.description ?? null,
  plannedStart:          r.planned_start,
  plannedEnd:            r.planned_end,
  statusId:              r.status_id,
  statusCategory:        r.syn_reservation_statuses?.status_category ?? 'reserved',
  statusName:            r.syn_reservation_statuses?.name ?? '—',
  selectedRepositoryIds: r.selected_repository_ids ?? [],
  usageSession:          r.usage_session ?? null,
  policyFlags:           r.policy_flags ?? { exceedsMaxDuration: false },
  extractedRepos:        r.extracted_repos ?? [],
});

const fromRes = (r: Reservation) => ({
  id:                      r.id,
  environment_id:          r.environmentId,
  reserved_by_user_id:     r.reservedByUserId,
  jira_issue_keys:         r.jiraIssueKeys,
  description:             r.description,
  planned_start:           r.plannedStart,
  planned_end:             r.plannedEnd,
  status_id:               r.statusId,
  selected_repository_ids: r.selectedRepositoryIds,
  usage_session:           r.usageSession,
  policy_flags:            r.policyFlags,
  extracted_repos:         r.extractedRepos ?? [],
});

const toRepo = (r: any): Repository => ({
  id:         r.id,
  name:       r.name,
  isArchived: r.is_archived,
});

const toPolicy = (r: any): EnvPolicy => ({
  bookingWindowDays:  r.booking_window_days,
  minDurationHours:   Number(r.min_duration_hours),
  allowPastStart:     r.allow_past_start,
  businessHoursOnly:  r.business_hours_only,
  businessHoursStart: r.business_hours_start,
  businessHoursEnd:   r.business_hours_end,
});

export class SupabaseReservationRepo implements IReservationRepo {
  constructor(private db: SupabaseClient) {}

  async getAll(): Promise<Reservation[]> {
    const { data, error } = await this.db
      .from('syn_reservations')
      .select('*, syn_reservation_statuses(name, status_category)');
    if (error) throw error;
    return (data ?? []).map((r: any) => toRes(r as RowWithStatus));
  }

  async getRepositories(): Promise<Repository[]> {
    const { data, error } = await this.db.from('syn_repositories').select('*').order('name');
    if (error) throw error;
    return (data ?? []).map(toRepo);
  }

  async getPolicy(): Promise<EnvPolicy> {
    const { data, error } = await this.db.from('syn_policy').select('*').eq('id', 1).single();
    if (error) throw error;
    return toPolicy(data);
  }

  async upsert(res: Reservation): Promise<void> {
    const { error } = await this.db.from('syn_reservations').upsert(fromRes(res));
    if (error) {
      if (error.code === '23505') {
        throw new ConflictError('environment', error.message);
      }
      throw error;
    }
  }

  async insert(res: Reservation): Promise<void> {
    const { error } = await this.db.from('syn_reservations').insert(fromRes(res));
    if (error) {
      if (error.code === '23505') {
        throw new ConflictError('environment', error.message);
      }
      throw error;
    }
  }

  async patch(id: string, patch: Partial<Reservation>): Promise<void> {
    const dbPatch: any = {};
    if (patch.statusId     !== undefined) dbPatch.status_id      = patch.statusId;
    if (patch.usageSession !== undefined) dbPatch.usage_session  = patch.usageSession;
    if (patch.policyFlags  !== undefined) dbPatch.policy_flags   = patch.policyFlags;
    const { error } = await this.db.from('syn_reservations').update(dbPatch).eq('id', id);
    if (error) throw error;
  }

  async savePolicy(policy: EnvPolicy): Promise<void> {
    const { error } = await this.db.from('syn_policy').upsert({
      id: 1,
      booking_window_days:  policy.bookingWindowDays,
      min_duration_hours:   policy.minDurationHours,
      allow_past_start:     policy.allowPastStart,
      business_hours_only:  policy.businessHoursOnly,
      business_hours_start: policy.businessHoursStart,
      business_hours_end:   policy.businessHoursEnd,
    });
    if (error) throw error;
  }

  async createRepository(repo: Omit<Repository, 'id'>): Promise<Repository> {
    const id = Math.random().toString(36).slice(2, 10);
    const { data, error } = await this.db
      .from('syn_repositories')
      .insert({ id, name: repo.name, is_archived: false })
      .select().single();
    if (error) throw error;
    return toRepo(data);
  }

  async updateRepository(repo: Repository): Promise<void> {
    const { error } = await this.db
      .from('syn_repositories')
      .update({ name: repo.name, is_archived: repo.isArchived })
      .eq('id', repo.id);
    if (error) throw error;
  }
}
