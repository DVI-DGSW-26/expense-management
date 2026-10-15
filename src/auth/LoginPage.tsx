import { useState, type FormEvent } from 'react';
import { API_BASE, ApiError, TOKEN_PAGE_URL, tokenExpiry } from '../api/client';
import { parseTokenInput, useAuth } from './AuthContext';

/** API 서버가 CORS 로 허용하는 이 앱의 주소 */
const ALLOWED_ORIGIN = 'http://localhost:5173';

function describeLoginError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) {
      // 브라우저가 CORS 로 막으면 응답 없이 실패한다
      return window.location.origin !== ALLOWED_ORIGIN && API_BASE.startsWith('https://api.dvi-ind.com')
        ? `지금 주소(${window.location.origin})는 API 서버가 허용하지 않습니다. ${ALLOWED_ORIGIN} 으로 접속해 주세요.`
        : `API 서버(${API_BASE})에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.`;
    }
    if (err.status === 401) return '서버가 토큰을 거부했습니다. 만료됐거나 다른 서비스의 토큰입니다. 새 토큰을 받아 다시 붙여넣어 주세요.';
    if (err.status === 403) return '이 계정에는 경비 서비스 권한이 없습니다. 관리자에게 권한을 요청해 주세요.';
    return `${err.message} (${err.status})`;
  }
  return err instanceof Error ? err.message : '로그인하지 못했습니다.';
}

export function LoginPage() {
  const { signIn } = useAuth();
  const [access, setAccess] = useState('');
  const [refresh, setRefresh] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!access.trim()) {
      setError('토큰을 붙여넣어 주세요.');
      return;
    }
    const { access: token } = parseTokenInput(access);
    if (token.split('.').length !== 3) {
      setError('앱 토큰 형식이 아닙니다. 로그인 페이지에 표시된 accessToken(eyJ로 시작하는 긴 문자열)을 붙여넣어 주세요.');
      return;
    }
    const exp = tokenExpiry(token);
    if (exp && exp * 1000 < Date.now()) {
      setError('만료된 토큰입니다 (수명 30분). 로그인 페이지를 새로고침해 새 토큰을 받아 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await signIn(access, refresh);
    } catch (err) {
      setError(describeLoginError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-sheet">
        <h1 className="login-title">사무실 경비</h1>
        <p className="login-lede">경비, 임차관리비, 구독 결제를 한 장부에서 관리합니다.</p>

        <ol className="login-steps">
          <li>
            <a className="btn btn-primary" href={TOKEN_PAGE_URL} target="_blank" rel="noreferrer">
              DVI 통합 로그인 열기
            </a>
            <span>로그인하면 토큰이 표시됩니다.</span>
          </li>
          <li>
            <span>표시된 토큰을 복사해 아래에 붙여넣으세요. 토큰은 30분 동안 유효합니다.</span>
          </li>
        </ol>

        <form onSubmit={submit} className="stack">
          <label className="field">
            <span className="field-label">앱 토큰</span>
            <textarea
              className="input mono"
              rows={4}
              value={access}
              onChange={(e) => setAccess(e.target.value)}
              placeholder="eyJhbGciOi…"
              autoFocus
              spellCheck={false}
            />
          </label>
          <details className="login-more">
            <summary>갱신 핸들이 있으면 입력 (선택)</summary>
            <label className="field">
              <span className="field-label">갱신 핸들</span>
              <input
                className="input mono"
                value={refresh}
                onChange={(e) => setRefresh(e.target.value)}
                spellCheck={false}
              />
              <span className="field-hint">입력하면 토큰이 만료돼도 자동으로 다시 받아 최대 12시간 로그인이 유지됩니다.</span>
            </label>
          </details>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? '확인 중…' : '로그인'}
          </button>
        </form>
      </div>
    </main>
  );
}
