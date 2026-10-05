import { useEffect, useState } from 'react';
import { api, saveSession } from '../api';
import { UserInfo } from '../types';

interface UserOption {
  username: string;
  name: string;
  role: string;
  accountNo: string | null;
}

export default function Login({ onLogin }: { onLogin: (u: UserInfo) => void }) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<UserOption[]>('/auth/users').then(setUsers).catch(() => setError('无法连接后端服务'));
  }, []);

  const login = async (username: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await api<{ token: string; user: UserInfo }>('/auth/login', {
        method: 'POST',
        body: { username },
      });
      saveSession(res.token, res.user);
      onLogin(res.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="card">
        <h2>燃气账单异议与用量复核系统</h2>
        <p className="muted">演示环境：选择账号直接登录</p>
        {error && <div className="error-box">{error}</div>}
        {users.map((u) => (
          <div key={u.username} className="user-option" onClick={() => !loading && login(u.username)}>
            <div>
              <div style={{ fontWeight: 600 }}>{u.name}</div>
              <div className="muted">
                {u.username}
                {u.accountNo ? ` · 户号 ${u.accountNo}` : ''}
              </div>
            </div>
            <span className={`badge ${u.role === 'AGENT' ? 'blue' : 'green'}`}>
              {u.role === 'AGENT' ? '客服' : '住户'}
            </span>
          </div>
        ))}
        {users.length === 0 && !error && <p className="muted">加载账号中…</p>}
      </div>
    </div>
  );
}
