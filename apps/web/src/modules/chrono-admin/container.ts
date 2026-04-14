/**
 * Chrono Admin module — Dependency container
 *
 * All infrastructure adapters are instantiated here. UI components
 * import from this file — never from /infra/ directly.
 */
import { supabase } from '@/shared/lib/supabaseClient';
import { AdminFichajeSupabaseRepository } from './infra/supabase/AdminFichajeSupabaseRepository';
import { AdminVacacionSupabaseRepository } from './infra/supabase/AdminVacacionSupabaseRepository';
import { ConfigSupabaseRepository } from './infra/supabase/ConfigSupabaseRepository';
import { EquipoSupabaseRepository } from './infra/supabase/EquipoSupabaseRepository';
import { EmpleadoConfigSupabaseRepository } from './infra/supabase/EmpleadoConfigSupabaseRepository';
import { FichaEmpleadoSupabaseRepository } from './infra/supabase/FichaEmpleadoSupabaseRepository';
import { JiraResumenSupabaseRepository } from './infra/supabase/JiraResumenSupabaseRepository';
import { SupabaseUserRepo } from '@/shared/infra/SupabaseUserRepo';
import { SupabaseNotificationRepo } from '@/shared/infra/SupabaseNotificationRepo';

export const fichajeRepo = new AdminFichajeSupabaseRepository(supabase);
export const vacacionRepo = new AdminVacacionSupabaseRepository(supabase);
export const configRepo = new ConfigSupabaseRepository(supabase);
export const equipoRepo = new EquipoSupabaseRepository(supabase);
export const empleadoConfigRepo = new EmpleadoConfigSupabaseRepository(supabase);
export const fichaEmpleadoRepo = new FichaEmpleadoSupabaseRepository(supabase);
export const jiraResumenRepo = new JiraResumenSupabaseRepository(supabase);
export const notificacionRepo = new SupabaseNotificationRepo(supabase);
export const userRepo = new SupabaseUserRepo(supabase);
