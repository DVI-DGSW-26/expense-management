import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { tokens } from '../api/client';
import { authApi } from '../api/endpoints';
import type { Me } from '../api/types';

interface AuthState {
  me: Me | null;
  /** 토큰은 있는데 아직 /auth/me 를 확인 중 */
  checking: boolean;
  signIn: (accessToken: string, refreshToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * 로그인 서버가 이 앱으로 돌려보낼 때 주소 조각(#accessToken=…&refreshToken=…)에
 * 토큰을 실어 보내면 받아서 저장한다.
 */
function takeTokensFromHash() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const access = hash.get('accessToken') ?? hash.get('access_token');
  if (!access) return;
  tokens.set(access, hash.get('refreshToken') ?? hash.get('refresh_token'));
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(() => {
    takeTokensFromHash();
    return !!tokens.access;
  });

  const load = useCallback(async () => {
    if (!tokens.access) {
      setMe(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      setMe(await authApi.me());
    } catch {
      setMe(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    load();
    // 다른 곳에서 토큰이 지워지면(갱신 실패 등) 로그인 화면으로
    return tokens.subscribe(() => {
      if (!tokens.access) setMe(null);
    });
  }, [load]);

  const signIn = useCallback(
    async (accessToken: string, refreshToken?: string) => {
      tokens.set(accessToken.trim().replace(/^Bearer\s+/i, ''), refreshToken?.trim() || null);
      const user = await authApi.me();
      setMe(user);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await authApi.logout();
    setMe(null);
  }, []);

  return <AuthContext.Provider value={{ me, checking, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider 밖에서 useAuth 를 사용했습니다.');
  return ctx;
}
