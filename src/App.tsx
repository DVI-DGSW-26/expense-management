import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { AccountsProvider } from './components/accounts';
import { ToastProvider } from './components/ui';
import { AccountsPage } from './pages/AccountsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { LeasePage } from './pages/LeasePage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { SummaryPage } from './pages/SummaryPage';

const NAV = [
  { to: '/expenses', label: '경비' },
  { to: '/subscriptions', label: '구독' },
  { to: '/lease', label: '임차관리비' },
  { to: '/summary', label: '연간 집계' },
  { to: '/accounts', label: '차변계정' },
];

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

function Gate() {
  const { me, checking } = useAuth();
  if (checking) return <div className="boot">로그인 정보를 확인하는 중…</div>;
  if (!me) return <LoginPage />;
  return (
    <AccountsProvider>
      <Shell />
    </AccountsProvider>
  );
}

function Shell() {
  const { me, signOut } = useAuth();
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">사무실 경비</div>
        <nav className="nav" aria-label="주 메뉴">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="who">
          <span className="who-name">{me?.name ?? me?.username}</span>
          <button className="link" onClick={signOut}>
            로그아웃
          </button>
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/lease" element={<LeasePage />} />
          <Route path="/summary" element={<SummaryPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="*" element={<Navigate to="/expenses" replace />} />
        </Routes>
      </main>
    </div>
  );
}
