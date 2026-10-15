import { useState, type FormEvent } from 'react';
import { ApiError, TOKEN_PAGE_URL } from '../api/client';
import { useAuth } from './AuthContext';

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
    setBusy(true);
    setError('');
    try {
      await signIn(access, refresh);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? '토큰이 만료됐거나 올바르지 않습니다. 새 토큰을 받아 다시 붙여넣어 주세요.'
          : err instanceof Error
            ? err.message
            : '로그인하지 못했습니다.',
      );
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
