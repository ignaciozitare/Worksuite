/**
 * Chrono module — Dependency container
 *
 * All infrastructure adapters are instantiated here. UI components
 * import from this file — never from /infra/ directly.
 */
import { supabase } from '@/shared/lib/supabaseClient';
import { FichajeSupabaseRepository } from './infra/supabase/FichajeSupabaseRepository';
import { BolsaHorasSupabaseRepository } from './infra/supabase/BolsaHorasSupabaseRepository';
import { VacacionSupabaseRepository } from './infra/supabase/VacacionSupabaseRepository';
import { IncidenciaSupabaseRepository } from './infra/supabase/IncidenciaSupabaseRepository';
import { AlarmaSupabaseRepository } from './infra/supabase/AlarmaSupabaseRepository';
import { ConfigEmpresaSupabaseRepository } from './infra/supabase/ConfigEmpresaSupabaseRepository';
import { NominatimGeoLocationService } from './infra/NominatimGeoLocationService';

export const fichajeRepo = new FichajeSupabaseRepository(supabase);
export const bolsaRepo = new BolsaHorasSupabaseRepository(supabase);
export const vacacionRepo = new VacacionSupabaseRepository(supabase);
export const incidenciaRepo = new IncidenciaSupabaseRepository(supabase);
export const alarmaRepo = new AlarmaSupabaseRepository(supabase);
export const configEmpresaRepo = new ConfigEmpresaSupabaseRepository(supabase);
export const geoService = new NominatimGeoLocationService();
