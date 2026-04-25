import type { SupabaseClient } from '@supabase/supabase-js';
import type { IAvatarRepo } from '../domain/ports/IAvatarRepo';

const BUCKET = 'user-avatars';

export class SupabaseAvatarRepo implements IAvatarRepo {
  constructor(private sb: SupabaseClient) {}

  async uploadPhoto(userId: string, blob: Blob, ext: 'jpg' | 'png' | 'webp'): Promise<string> {
    const path = `${userId}/avatar.${ext}`;
    const contentType =
      ext === 'png'  ? 'image/png'  :
      ext === 'webp' ? 'image/webp' :
                       'image/jpeg';

    const { error: uploadErr } = await this.sb.storage
      .from(BUCKET)
      .upload(path, blob, { upsert: true, contentType, cacheControl: '3600' });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data } = this.sb.storage.from(BUCKET).getPublicUrl(path);
    // Append a cache-busting param so the new image shows up immediately even
    // when the URL itself is unchanged (avatar.jpg overwritten in place).
    const bust = Date.now();
    const sep = data.publicUrl.includes('?') ? '&' : '?';
    return `${data.publicUrl}${sep}v=${bust}`;
  }

  async setAvatarUrl(userId: string, value: string | null): Promise<void> {
    const { error } = await this.sb
      .from('users')
      .update({ avatar_url: value })
      .eq('id', userId);
    if (error) throw new Error(error.message);
  }
}
