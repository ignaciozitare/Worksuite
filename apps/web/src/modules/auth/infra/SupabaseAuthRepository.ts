import { supabase } from '../../../shared/lib/api';
import type { IAuthRepository, SignInResult, SsoConfig, OAuthProvider } from '../domain/ports/IAuthRepository';

export class SupabaseAuthRepository implements IAuthRepository {
  async signInWithPassword(email: string, password: string): Promise<SignInResult> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return {
        user: null,
        error: error.message === 'Invalid login credentials'
          ? 'Invalid email or password'
          : error.message,
      };
    }

    return {
      user: data.user ? { id: data.user.id, email: data.user.email ?? undefined } : null,
    };
  }

  async signInWithOAuth(provider: OAuthProvider, redirectTo: string): Promise<{ error?: string }> {
    const options: Record<string, unknown> = { redirectTo };
    if (provider === 'azure') {
      options.scopes = 'openid profile email offline_access';
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options,
    });

    return { error: error?.message };
  }

  async getSsoConfig(): Promise<SsoConfig | null> {
    const { data } = await supabase
      .from('sso_config')
      .select('allow_google, allow_microsoft')
      .eq('id', 1)
      .single();

    if (!data) return null;

    return {
      allowGoogle: !!data.allow_google,
      allowMicrosoft: !!data.allow_microsoft,
    };
  }
}
