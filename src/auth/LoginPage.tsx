import { LOGIN_URL } from '../api/client';
import { useAuth } from './AuthContext';

export function LoginPage() {
  const { loginError } = useAuth();

  return (
    <main className="login">
      <div className="login-sheet">
        <img className="login-logo" src="/logo.png" alt="" width={88} height={88} />
        <h1 className="login-title">사무실 경비</h1>
        <p className="login-lede">경비, 임차관리비, 구독 결제를 한 장부에서 관리합니다.</p>

        <div className="stack">
          <a className="btn btn-primary btn-block" href={LOGIN_URL}>
            DVI 통합 로그인
          </a>
          {loginError && <p className="form-error" role="alert">로그인하지 못했습니다: {loginError}</p>}
        </div>
      </div>
    </main>
  );
}
