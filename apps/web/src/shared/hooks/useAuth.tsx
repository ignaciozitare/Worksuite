import {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, type ReactNode,
} from 'react';
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
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<AuthState>({
    user: null, token: null, isLoading: true,
  });

  // FIX: loadUser como useCallback con deps estables para evitar stale closure.
  // Antes estaba definida como función suelta dentro del componente — cada render
  // creaba una nueva referencia, y login() capturaba la del primer render.
  const loadUser = useCallback(async (token: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setState({ user: null, token: null, isLoading: false });
        return;
      }
      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error || !profile) {
        setState({ user: null, token: null, isLoading: false });
        return;
      }

      const mapped: User = {
        ...(profile as any),
        avatarUrl: (profile as any).avatar_url ?? null,
      };
      setState({ user: mapped, token, isLoading: false });
    } catch {
      setState({ user: null, token: null, isLoading: false });
    }
  }, []); // sin deps — solo usa supabase (referencia estable) y setState (estable)

  // Referencia estable a loadUser para el useEffect de inicialización
  const loadUserRef = useRef(loadUser);
  useEffect(() => { loadUserRef.current = loadUser; }, [loadUser]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        void loadUserRef.current(data.session.access_token);
      } else {
        setState({ user: null, token: null, isLoading: false });
      }
    });
  }, []); // solo se ejecuta al montar

  const login = useCallback(async (email: string, password: string) => {
    setState(s => ({ ...s, isLoading: true }));
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setState(s => ({ ...s, isLoading: false }));
      throw new Error(error.message);
    }
    // Ahora usa la referencia actualizada, no la del primer render
    await loadUser(data.session.access_token);
  }, [loadUser]); // dep correcta

  const logout = useCallback(() => {
    void supabase.auth.signOut();
    setState({ user: null, token: null, isLoading: false });
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) await loadUser(data.session.access_token);
  }, [loadUser]);

  return (
    <AuthCtx.Provider value={{ ...state, login, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
