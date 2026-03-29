import type { SupabaseClient } from '@supabase/supabase-js';
import type { IAuthService, AuthCredentials, AuthResult } from '../../domain/auth/IAuthService.js';

export class SupabaseAuthService implements IAuthService {
  constructor(private readonly db: SupabaseClient) {}

  async signIn(credentials: AuthCredentials): Promise<AuthResult> {
    const { data, error } = await this.db.auth.signInWithPassword({
      email:    credentials.email,
      password: credentials.password,
    });

    if (error || !data.user) {
      throw Object.assign(
        new Error('Invalid email or password'),
        { statusCode: 401, code: 'INVALID_CREDENTIALS' },
      );
    }

    return {
      userId: data.user.id,
      email:  data.user.email ?? credentials.email,
    };
  }
}
