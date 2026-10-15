import { useState, type FormEvent } from 'react';
import { API_BASE, ApiError, LOGIN_URL, TOKEN_PAGE_URL, tokenExpiry } from '../api/client';
import { parseTokenInput, useAuth } from './AuthContext';

function describeLoginError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) {
      // 브라우저가 CORS 로 막으면 응답 없이 실패한다
      return `API 서버(${API_BASE})에 연결하지 못했습니다. 지금 주소(${window.location.origin})가 API 서버의 허용 목록에 없거나 네트워크에 문제가 있습니다.`;
    }
    if (err.status === 401) return '서버가 토큰을 거부했습니다. 만료됐거나 다른 서비스의 토큰입니다. 다시 로그인해 주세요.';
    if (err.status === 403) return '이 계정에는 경비 서비스 권한이 없습니다. 관리자에게 권한을 요청해 주세요.';
    return `${err.message} (${err.status})`;
  }
  return err instanceof Error ? err.message : '로그인하지 못했습니다.';
}

export function LoginPage() {
  const { signIn, loginError } = useAuth();
  const [access, setAccess] = useState('');
  const [refresh, setRefresh] = useState('');
  const [error, setError] = useState(loginError ? `로그인하지 못했습니다: ${loginError}` : '');
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

        <div className="stack">
          <a className="btn btn-primary btn-block" href={LOGIN_URL}>
            DVI 통합 로그인
          </a>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        <details className="login-more">
          <summary>토큰을 직접 붙여넣기</summary>
          <form onSubmit={submit} className="stack">
            <p className="field-hint">
              <a href={TOKEN_PAGE_URL} target="_blank" rel="noreferrer">
                토큰 발급 페이지
              </a>
              에서 로그인하면 앱 토큰(수명 30분)이 표시됩니다.
            </p>
            <label className="field">
              <span className="field-label">앱 토큰</span>
              <textarea
                className="input mono"
                rows={4}
                value={access}
                onChange={(e) => setAccess(e.target.value)}
                placeholder="eyJhbGciOi…"
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span className="field-label">갱신 핸들 (선택)</span>
              <input
                className="input mono"
                value={refresh}
                onChange={(e) => setRefresh(e.target.value)}
                spellCheck={false}
              />
              <span className="field-hint">입력하면 토큰이 만료돼도 자동으로 다시 받아 최대 12시간 로그인이 유지됩니다.</span>
            </label>
            <button className="btn btn-block" disabled={busy}>
              {busy ? '확인 중…' : '토큰으로 로그인'}
            </button>
          </form>
        </details>
      </div>
    </main>
  );
}
