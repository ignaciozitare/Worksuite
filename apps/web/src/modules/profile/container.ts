import { supabase } from '@/shared/lib/supabaseClient';
import type { IAvatarRepo } from './domain/ports/IAvatarRepo';
import { SupabaseAvatarRepo } from './infra/SupabaseAvatarRepo';

export const avatarRepo: IAvatarRepo = new SupabaseAvatarRepo(supabase);
