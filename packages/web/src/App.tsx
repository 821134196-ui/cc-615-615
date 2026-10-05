import { useState } from 'react';
import { UserInfo } from './types';
import { setToken } from './api';
import { Login } from './pages/Login';
import { BillsPage } from './pages/BillsPage';
import { DisputesPage } from './pages/DisputesPage';
import { LedgerPage } from './pages/LedgerPage';
import { NotificationsPage } from './pages/NotificationsPage';

type Tab = 'bills' | 'disputes' | 'ledger' | 'notifications';

export function App() {
  const [user, setUser] = useState<UserInfo | null>(() => {
    const raw = localStorage.getItem('gas_review_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [tab, setTab] = useState<Tab>('bills');
  const [notifKey, setNotifKey] = useState(0);

  if (!user) {
    return (
      <Login
        onLogin={(u) => {
          localStorage.setItem('gas_review_user', JSON.stringify(u));
          setUser(u);
          setTab(u.role === 'AGENT' ? 'disputes' : 'bills');
        }}
      />
    );
  }

  const logout = () => {
    setToken(null);
    localStorage.removeItem('gas_review_user');
    setUser(null);
  };

  const tabs: { key: Tab; label: string }[] =
    user.role === 'AGENT'
      ? [
          { key: 'disputes', label: '异议复核工作台' },
          { key: 'bills', label: '账单与读数' },
          { key: 'notifications', label: '通知' },
        ]
      : [
          { key: 'bills', label: '我的账单' },
          { key: 'disputes', label: '我的异议' },
          { key: 'ledger', label: '费用流水' },
          { key: 'notifications', label: '通知' },
        ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">燃气账单复核</span>
        <nav className="tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => {
                setTab(t.key);
                setNotifKey((k) => k + 1);
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="userbox">
          <span>{user.displayName}</span>
          <span className="role">{user.role === 'AGENT' ? '客服' : '住户'}</span>
          <button className="btn btn-sm" onClick={logout}>退出</button>
        </div>
      </header>

      {tab === 'bills' && <BillsPage user={user} />}
      {tab === 'disputes' && <DisputesPage user={user} />}
      {tab === 'ledger' && <LedgerPage />}
      {tab === 'notifications' && <NotificationsPage refreshKey={notifKey} />}
    </div>
  );
}
