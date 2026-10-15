import type { TokenResponse } from './types';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'https://api.dvi-ind.com/expenses').replace(/\/$/, '');

/**
 * DVI 통합 로그인 시작 주소. 로그인이 끝나면 서버가
 * `{FRONTEND_URL}/auth/callback#token=…&refresh=…` 로 돌려보낸다 (권한이 없으면 `#error=`).
 */
export const LOGIN_URL = `${API_BASE}/oauth2/authorization/keycloak`;

/** 브라우저로 열면 DVI 통합 로그인 후 시험용 토큰을 보여주는 페이지 */
export const TOKEN_PAGE_URL = `${API_BASE}/login/swagger`;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

// ── 토큰 저장소 ───────────────────────────────────────────────

const ACCESS_KEY = 'expenses.accessToken';
const REFRESH_KEY = 'expenses.refreshToken';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* 저장소를 쓸 수 없으면 이번 탭에서만 유지된다 */
  }
}

let accessToken = readStorage(ACCESS_KEY);
let refreshToken = readStorage(REFRESH_KEY);
const listeners = new Set<() => void>();

export const tokens = {
  get access() {
    return accessToken;
  },
  get refresh() {
    return refreshToken;
  },
  set(access: string | null, refresh?: string | null) {
    accessToken = access;
    writeStorage(ACCESS_KEY, access);
    if (refresh !== undefined) {
      refreshToken = refresh;
      writeStorage(REFRESH_KEY, refresh);
    }
    listeners.forEach((fn) => fn());
  },
  clear() {
    this.set(null, null);
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

/** JWT 의 exp(초)를 읽는다. 형식이 아니면 null. */
export function tokenExpiry(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(payload));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

// ── 요청 ─────────────────────────────────────────────────────

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  query?: Query;
  json?: unknown;
  form?: FormData;
  /** true 면 본문을 해석하지 않고 Response 를 그대로 돌려준다 (파일 다운로드) */
  raw?: boolean;
  /** 401 에서 토큰 갱신을 시도하지 않는다 */
  noRefresh?: boolean;
}

function buildUrl(path: string, query?: Query) {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function toError(res: Response): Promise<ApiError> {
  let message = '';
  let code: string | undefined;
  try {
    const body = await res.json();
    message = body?.message ?? '';
    code = body?.code;
  } catch {
    /* 본문이 JSON 이 아님 */
  }
  if (!message) {
    message =
      res.status === 401
        ? '로그인이 필요합니다.'
        : res.status === 403
          ? '이 작업을 할 권한이 없습니다.'
          : res.status === 409
            ? '이미 같은 항목이 있거나 다른 데이터가 사용 중입니다.'
            : `요청을 처리하지 못했습니다 (${res.status}).`;
  }
  return new ApiError(res.status, message, code);
}

let refreshing: Promise<boolean> | null = null;

/** 갱신 핸들로 앱 토큰을 새로 받는다. 동시에 여러 번 불려도 한 번만 요청한다. */
export function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return Promise.resolve(false);
  refreshing ??= (async () => {
    try {
      const res = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (res.status === 401) {
        tokens.clear();
        return false;
      }
      if (!res.ok) {
        // 502 등은 인증 서버 일시 장애 — 로그아웃시키지 않는다
        throw await toError(res);
      }
      const data = (await res.json()).data as TokenResponse;
      tokens.set(data.accessToken, data.refreshToken);
      return true;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function send(method: string, path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  try {
    return await fetch(buildUrl(path, opts.query), { method, headers, body });
  } catch {
    throw new ApiError(0, '서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.');
  }
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await send(method, path, opts);
  if (res.status === 401 && !opts.noRefresh && refreshToken) {
    if (await refreshAccessToken()) res = await send(method, path, opts);
  }
  if (res.status === 401 && !opts.noRefresh) tokens.clear();
  if (!res.ok) throw await toError(res);
  if (opts.raw) return res as T;
  const text = await res.text();
  return (text ? JSON.parse(text).data : undefined) as T;
}
