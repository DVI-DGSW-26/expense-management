import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { tokens } from '../api/client';
import { authApi } from '../api/endpoints';
import type { Me } from '../api/types';

interface AuthState {
  me: Me | null;
  /** 토큰은 있는데 아직 /auth/me 를 확인 중 */
  checking: boolean;
  /** 로그인 서버가 돌려보낸 실패 사유 (#error=) */
  loginError: string | null;
  signIn: (accessToken: string, refreshToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * 로그인 서버가 이 앱의 /auth/callback 으로 돌려보낼 때 주소 조각에 실어 준
 * 토큰(#token=…&refresh=…)을 받아 저장한다. 실패하면 #error= 로 사유가 온다.
 * 주소 조각은 바로 지워 토큰이 방문 기록에 남지 않게 한다.
 */
let hashError: string | null | undefined;

/** 개발 모드(StrictMode)에서 초기화가 두 번 불려도 주소 조각은 한 번만 읽는다 */
function takeTokensFromHashOnce(): string | null {
  if (hashError === undefined) hashError = takeTokensFromHash();
  return hashError;
}

function takeTokensFromHash(): string | null {
  const onCallback = window.location.pathname === '/auth/callback';
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const access = hash.get('token') ?? hash.get('accessToken') ?? hash.get('access_token');
  const error = hash.get('error');
  if (!access && !error && !onCallback) return null;
  if (access) tokens.set(access, hash.get('refresh') ?? hash.get('refreshToken') ?? hash.get('refresh_token'));
  history.replaceState(null, '', onCallback ? '/' : window.location.pathname + window.location.search);
  return error;
}

/**
 * 붙여넣은 텍스트에서 토큰을 꺼낸다.
 * 토큰 응답 JSON 전체를 붙여넣어도 되고, "Bearer " 접두어나 줄바꿈이 섞여 있어도 된다.
 */
export function parseTokenInput(text: string): { access: string; refresh: string | null } {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed);
      const body = json?.data ?? json;
      const access = body?.accessToken ?? body?.access_token;
      if (typeof access === 'string') {
        return { access, refresh: body?.refreshToken ?? body?.refresh_token ?? null };
      }
    } catch {
      /* JSON 이 아니면 토큰 문자열로 취급 */
    }
  }
  return { access: trimmed.replace(/^Bearer\s+/i, '').replace(/\s+/g, ''), refresh: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loginError] = useState(takeTokensFromHashOnce);
  const [checking, setChecking] = useState(() => !!tokens.access);

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
    async (accessInput: string, refreshInput?: string) => {
      const parsed = parseTokenInput(accessInput);
      const refresh = parsed.refresh ?? (refreshInput?.replace(/\s+/g, '') || null);
      tokens.set(parsed.access, refresh);
      try {
        setMe(await authApi.me());
      } catch (e) {
        tokens.clear();
        throw e;
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    await authApi.logout();
    setMe(null);
  }, []);

  return <AuthContext.Provider value={{ me, checking, loginError, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider 밖에서 useAuth 를 사용했습니다.');
  return ctx;
}
