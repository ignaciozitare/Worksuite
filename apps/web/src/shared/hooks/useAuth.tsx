import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '../lib/api';
import type { User } from '@worksuite/shared-types';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<AuthState>({ user: null, token: null, isLoading: true });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        void loadUser(data.session.access_token);
      } else {
        setState({ user: null, token: null, isLoading: false });
      }
    });
  }, []);

  const loadUser = async (token: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();
    setState({ user: profile as User, token, isLoading: false });
  };

  const login = useCallback(async (email: string, password: string) => {
    setState(s => ({ ...s, isLoading: true }));
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setState(s => ({ ...s, isLoading: false }));
      throw new Error(error.message);
    }
    await loadUser(data.session.access_token);
  }, []);

  const logout = useCallback(() => {
    void supabase.auth.signOut();
    setState({ user: null, token: null, isLoading: false });
  }, []);

  return (
    <AuthCtx.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
