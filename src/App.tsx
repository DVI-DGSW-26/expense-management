import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { AccountsProvider } from './components/accounts';
import { BuildingIcon, ChartIcon, LogoutIcon, ReceiptIcon, RepeatIcon, TagIcon } from './components/icons';
import { ToastProvider } from './components/ui';
import { AccountsPage } from './pages/AccountsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { LeasePage } from './pages/LeasePage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { SummaryPage } from './pages/SummaryPage';

const NAV = [
  {
    group: '장부',
    items: [
      { to: '/expenses', label: '경비', icon: ReceiptIcon },
      { to: '/subscriptions', label: '구독', icon: RepeatIcon },
      { to: '/lease', label: '임차관리비', icon: BuildingIcon },
    ],
  },
  {
    group: '분석·설정',
    items: [
      { to: '/summary', label: '연간 집계', icon: ChartIcon },
      { to: '/accounts', label: '차변계정', icon: TagIcon },
    ],
  },
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
        <div className="brand">
          <img src="/logo.png" alt="" width={40} height={40} />
          <span>사무실 경비</span>
        </div>
        <nav className="nav" aria-label="주 메뉴">
          {NAV.map((g) => (
            <div key={g.group} className="nav-group">
              <p className="nav-group-label">{g.group}</p>
              {g.items.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                  <Icon />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="who">
          <span className="avatar" aria-hidden>
            {(me?.name ?? me?.username ?? '?').slice(0, 1)}
          </span>
          <span className="who-name">{me?.name ?? me?.username}</span>
          <button className="nav-link logout" onClick={signOut}>
            <LogoutIcon />
            <span>로그아웃</span>
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
