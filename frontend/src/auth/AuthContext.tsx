import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/api/client';
import type { Me } from '@/api/types';

interface AuthState {
  user: Me | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    let alive = true;
    api
      .get<void>('/auth/csrf/')
      .then(() => api.get<Me>('/auth/me/'))
      .then((me) => alive && setUser(me))
      .catch((e) => {
        if (!(e instanceof ApiError) || ![401, 403].includes(e.status)) console.error(e);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    await api.get<void>('/auth/csrf/');
    const me = await api.post<Me>('/auth/login/', { username, password });
    await api.get<void>('/auth/csrf/'); // Django rotates the CSRF token on login
    setUser(me);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post<void>('/auth/logout/');
    } finally {
      qc.clear();
      setUser(null);
    }
  }, [qc]);

  const value = useMemo(() => ({ user, loading, signIn, signOut }), [user, loading, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
