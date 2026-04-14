/**
 * Environments module — Dependency container
 *
 * All infrastructure adapters are instantiated here and injected into
 * use-cases / services.  UI components import from this file instead
 * of reaching into /infra/ directly — keeping hexagonal boundaries clean.
 */
import { supabase } from '@/shared/lib/supabaseClient';
import { HttpJiraApiAdapter } from '@/shared/infra/HttpJiraApiAdapter';

// ── Infrastructure adapters ─────────────────────────────────────────────────
import { SupabaseEnvironmentRepo } from './infra/supabase/SupabaseEnvironmentRepo';
import { SupabaseReservationRepo } from './infra/supabase/SupabaseReservationRepo';
import { SupabaseReservationStatusRepo } from './infra/supabase/SupabaseReservationStatusRepo';
import { SupabaseReservationHistoryRepo } from './infra/supabase/SupabaseReservationHistoryRepo';
import { SupabaseJiraConfigRepo } from './infra/supabase/SupabaseJiraConfigRepo';
import { SupabaseJiraFilterConfigRepo } from './infra/supabase/SupabaseJiraFilterConfigRepo';
import { SupabaseEnvHistoryNoteRepo } from './infra/supabase/SupabaseEnvHistoryNoteRepo';

// ── Domain use-cases ────────────────────────────────────────────────────────
import { GetEnvironments } from './domain/useCases/GetEnvironments';
import { GetReservations } from './domain/useCases/GetReservations';
import { UpsertReservation } from './domain/useCases/UpsertReservation';
import { UpdateReservationStatus } from './domain/useCases/UpdateReservationStatus';

// ── Adapter instances ───────────────────────────────────────────────────────
const API_BASE = ((import.meta as any).env?.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export const envRepo = new SupabaseEnvironmentRepo(supabase);
export const resRepo = new SupabaseReservationRepo(supabase);
export const statusRepo = new SupabaseReservationStatusRepo(supabase);
export const historyRepo = new SupabaseReservationHistoryRepo(supabase);
export const jiraConfigRepo = new SupabaseJiraConfigRepo(supabase);
export const jiraFilterRepo = new SupabaseJiraFilterConfigRepo(supabase);
export const historyNoteRepo = new SupabaseEnvHistoryNoteRepo(supabase);
export const jiraApi = new HttpJiraApiAdapter(API_BASE, getAuthHeaders);

// ── Use-case instances ──────────────────────────────────────────────────────
export const getEnvs = new GetEnvironments(envRepo);
export const getRes = new GetReservations(resRepo);
export const upsertUC = new UpsertReservation(resRepo);
export const statusUC = new UpdateReservationStatus(resRepo);
