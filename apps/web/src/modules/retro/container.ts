/**
 * Retro module — Dependency container
 *
 * All infrastructure adapters instantiated here. UI imports from this
 * file only — never from /infra/ directly.
 */
import { supabase } from '@/shared/lib/supabaseClient';
import { SupabaseRetroSessionRepo } from './infra/SupabaseRetroSessionRepo';
import { SupabaseRetroActionableRepo } from './infra/SupabaseRetroActionableRepo';
import { SupabaseRetroTeamRepo } from './infra/SupabaseRetroTeamRepo';

export const sessionRepo = new SupabaseRetroSessionRepo(supabase);
export const actionableRepo = new SupabaseRetroActionableRepo(supabase);
export const teamRepo = new SupabaseRetroTeamRepo(supabase);
