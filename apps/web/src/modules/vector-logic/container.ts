/**
 * Vector Logic module — Dependency container
 *
 * All infrastructure adapters instantiated here. UI imports from this
 * file only — never from /infra/ directly.
 */
import { supabase } from '@/shared/lib/supabaseClient';
import { SupabaseWorkflowRepo } from './infra/supabase/SupabaseWorkflowRepo';
import { SupabaseStateRepo } from './infra/supabase/SupabaseStateRepo';
import { SupabaseTransitionRepo } from './infra/supabase/SupabaseTransitionRepo';
import { SupabaseTaskTypeRepo } from './infra/supabase/SupabaseTaskTypeRepo';
import { SupabaseTaskRepo } from './infra/supabase/SupabaseTaskRepo';

export const workflowRepo = new SupabaseWorkflowRepo(supabase);
export const stateRepo = new SupabaseStateRepo(supabase);
export const transitionRepo = new SupabaseTransitionRepo(supabase);
export const taskTypeRepo = new SupabaseTaskTypeRepo(supabase);
export const taskRepo = new SupabaseTaskRepo(supabase);
