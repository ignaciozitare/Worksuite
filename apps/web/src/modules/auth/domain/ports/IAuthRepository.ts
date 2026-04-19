export interface AuthUser {
  id: string;
  email?: string;
}

export interface SignInResult {
  user: AuthUser | null;
  error?: string;
}

export interface SsoConfig {
  allowGoogle: boolean;
  allowMicrosoft: boolean;
}

export type OAuthProvider = 'google' | 'azure';

export interface IAuthRepository {
  signInWithPassword(email: string, password: string): Promise<SignInResult>;
  signInWithOAuth(provider: OAuthProvider, redirectTo: string): Promise<{ error?: string }>;
  getSsoConfig(): Promise<SsoConfig | null>;
}
