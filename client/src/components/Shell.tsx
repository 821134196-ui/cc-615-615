import { ReactNode } from 'react';
import { UserInfo } from '../types';

export function Shell({
  user,
  onLogout,
  nav,
  children,
}: {
  user: UserInfo;
  onLogout: () => void;
  nav: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="topbar">
        <span className="brand">燃气账单异议与用量复核</span>
        <div className="nav">{nav}</div>
        <span className="who">
          {user.name}（{user.role === 'AGENT' ? '客服' : `住户 ${user.accountNo}`}）
        </span>
        <button className="link" onClick={onLogout}>
          退出登录
        </button>
      </div>
      <div className="page">{children}</div>
    </div>
  );
}
