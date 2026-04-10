// @ts-nocheck
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IFichaEmpleadoRepository } from '../../domain/ports/IFichaEmpleadoRepository';
import type { FichaEmpleado } from '../../domain/entities/FichaEmpleado';

/**
 * Adapter that calls the `ficha-empleado` Supabase Edge Function.
 *
 * Encryption/decryption happens server-side: the encryption key is a
 * function secret (ENCRYPTION_KEY) that never reaches the browser. The
 * function also enforces admin-only access via the caller's JWT.
 */
export class FichaEmpleadoSupabaseRepository implements IFichaEmpleadoRepository {
  constructor(private db: SupabaseClient) {}

  private async invoke(action: 'get' | 'upsert', userId: string, data?: unknown): Promise<any> {
    const session = await this.db.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const url = (import.meta as any).env?.VITE_SUPABASE_URL;
    const apikey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
    if (!url || !apikey) throw new Error('Supabase env vars not set');

    const res = await fetch(`${url}/functions/v1/ficha-empleado`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': apikey,
      },
      body: JSON.stringify({ action, userId, data }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || `ficha-empleado HTTP ${res.status}`);
    }
    return body;
  }

  async getByUserId(userId: string): Promise<FichaEmpleado | null> {
    const body = await this.invoke('get', userId);
    return body.ficha ?? null;
  }

  async upsert(
    userId: string,
    data: Partial<Omit<FichaEmpleado, 'id' | 'userId'>>,
  ): Promise<FichaEmpleado> {
    const body = await this.invoke('upsert', userId, data);
    if (!body.ficha) throw new Error('Edge function returned no ficha');
    return body.ficha;
  }
}
