import {
  createContext, useContext, useState, useCallback,
  type ReactNode,
} from 'react';
import type { User } from '@worksuite/shared-types';
import { api } from '../lib/api';

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
  const [state, setState] = useState<AuthState>(() => {
    const token = localStorage.getItem('ws_token');
    return { user: null, token, isLoading: !!token };
  });

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, isLoading: true }));
    try {
      const { token, user } = await api.login(email, password) as { token: string; user: User };
      localStorage.setItem('ws_token', token);
      setState({ user, token, isLoading: false });
    } catch (err) {
      setState((s) => ({ ...s, isLoading: false }));
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('ws_token');
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
