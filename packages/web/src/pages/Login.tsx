import { useState } from 'react';
import { api, setToken } from '../api';
import { UserInfo } from '../types';

export function Login({ onLogin }: { onLogin: (u: UserInfo, token: string) => void }) {
  const [username, setUsername] = useState('zhang');
  const [password, setPassword] = useState('resident123');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const res = await api<{ accessToken: string; user: UserInfo }>('POST', '/auth/login', { username, password });
      setToken(res.accessToken);
      onLogin(res.user, res.accessToken);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>燃气费账单异议与用量复核</h1>
        <div className="sub">居民账期费用核对 · 现场复核 · 跨期补退</div>
        {err && <div className="error-box">{err}</div>}
        <div className="field">
          <label>用户名</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>密码</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
          {loading ? '登录中…' : '登录'}
        </button>
        <div className="login-hint">
          {'演示账号\n客服：agent / agent123\n住户：zhang / resident123\n住户：li / resident123'}
        </div>
      </form>
    </div>
  );
}
