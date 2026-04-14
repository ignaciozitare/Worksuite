/**
 * Deploy Planner module — Dependency container
 *
 * All infrastructure adapters are instantiated here. UI components
 * import from this file — never from /infra/ directly.
 */
import { supabase } from '@/shared/lib/supabaseClient';
import { JiraSubtaskAdapter } from './infra/JiraSubtaskAdapter';
import { SupabaseSubtaskConfigRepo } from './infra/supabase/SupabaseSubtaskConfigRepo';
import { SupabaseDeployConfigRepo } from './infra/supabase/SupabaseDeployConfigRepo';
import { SupabaseDeployReleaseRawRepo } from './infra/supabase/SupabaseDeployReleaseRawRepo';
import { HttpJiraApiAdapter } from '@/shared/infra/HttpJiraApiAdapter';

const VITE_ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const API_BASE = (VITE_ENV['VITE_API_URL'] || 'http://localhost:3001').replace(/\/$/, '');

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export const subtaskAdapter = new JiraSubtaskAdapter(API_BASE, authHeaders);
export const subtaskConfigRepo = new SupabaseSubtaskConfigRepo(supabase);
export const deployConfigRepo = new SupabaseDeployConfigRepo(supabase);
export const releaseRawRepo = new SupabaseDeployReleaseRawRepo(supabase);
export const jiraApi = new HttpJiraApiAdapter(API_BASE, authHeaders);
