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
import { SupabaseAIRepo } from './infra/supabase/SupabaseAIRepo';
import { SupabasePriorityRepo } from './infra/supabase/SupabasePriorityRepo';
import { SupabaseTaskAlarmRepo } from './infra/supabase/SupabaseTaskAlarmRepo';
import { SupabaseWorldCityRepo } from './infra/supabase/SupabaseWorldCityRepo';
import { SupabaseUserSettingsRepo } from './infra/supabase/SupabaseUserSettingsRepo';
import { SupabaseTaskTypeHierarchyRepo } from './infra/supabase/SupabaseTaskTypeHierarchyRepo';
import { SupabaseBoardRepo } from './infra/supabase/SupabaseBoardRepo';
import { SupabaseBoardColumnRepo } from './infra/supabase/SupabaseBoardColumnRepo';
import { SupabaseBoardFilterRepo } from './infra/supabase/SupabaseBoardFilterRepo';
import { SupabaseBoardMemberRepo } from './infra/supabase/SupabaseBoardMemberRepo';
import { LLMService } from './infra/LLMService';
import { GmailConnectionApi, EmailRuleApi, EmailDetectionApi } from './infra/EmailIntelApi';
import { CloneTask, DeleteTaskCascade } from './application/CloneTask';

export const workflowRepo = new SupabaseWorkflowRepo(supabase);
export const stateRepo = new SupabaseStateRepo(supabase);
export const transitionRepo = new SupabaseTransitionRepo(supabase);
export const taskTypeRepo = new SupabaseTaskTypeRepo(supabase);
export const taskRepo = new SupabaseTaskRepo(supabase);
export const aiRepo = new SupabaseAIRepo(supabase);
export const priorityRepo = new SupabasePriorityRepo(supabase);
export const taskAlarmRepo = new SupabaseTaskAlarmRepo(supabase);
export const worldCityRepo = new SupabaseWorldCityRepo(supabase);
export const userSettingsRepo = new SupabaseUserSettingsRepo(supabase);
export const taskTypeHierarchyRepo = new SupabaseTaskTypeHierarchyRepo(supabase);
export const boardRepo = new SupabaseBoardRepo(supabase);
export const boardColumnRepo = new SupabaseBoardColumnRepo(supabase);
export const boardFilterRepo = new SupabaseBoardFilterRepo(supabase);
export const boardMemberRepo = new SupabaseBoardMemberRepo(supabase);
export const llmService = new LLMService();
export const gmailConnectionRepo = new GmailConnectionApi();
export const emailRuleRepo = new EmailRuleApi();
export const emailDetectionRepo = new EmailDetectionApi();

/** Use cases composed over the repos — UI imports these directly. */
export const cloneTaskUseCase = new CloneTask(taskRepo);
export const deleteTaskCascadeUseCase = new DeleteTaskCascade(taskRepo);

/** Auth helper — keeps supabase out of UI files */
export async function getSessionToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
