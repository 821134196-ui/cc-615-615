import { useState } from 'react';
import { clearSession, loadUser } from './api';
import { UserInfo } from './types';
import Login from './views/Login';
import ResidentApp from './views/ResidentApp';
import AgentApp from './views/AgentApp';

export default function App() {
  const [user, setUser] = useState<UserInfo | null>(() => loadUser<UserInfo>());

  if (!user) return <Login onLogin={setUser} />;

  const logout = () => {
    clearSession();
    setUser(null);
  };

  return user.role === 'AGENT' ? (
    <AgentApp user={user} onLogout={logout} />
  ) : (
    <ResidentApp user={user} onLogout={logout} />
  );
}
