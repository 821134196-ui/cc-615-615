import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import {
  AppNotification,
  Bill,
  fmtMoney,
  fmtTime,
  LedgerEntry,
  UserInfo,
} from '../types';
import { BillStatusBadge, DisputeStatusBadge } from '../components/common';
import { Shell } from '../components/Shell';
import BillDetail from './BillDetail';
import DisputeDetail from './DisputeDetail';

type Route =
  | { view: 'bills' }
  | { view: 'ledger' }
  | { view: 'notifications' }
  | { view: 'bill'; id: string }
  | { view: 'dispute'; id: string };

export function LedgerTable({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) return <p className="muted">暂无补退流水</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>时间</th>
          <th>账期</th>
          <th>类型</th>
          <th>金额</th>
          <th>原因 / 回执号</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id}>
            <td className="muted">{fmtTime(e.createdAt)}</td>
            <td>{e.period}</td>
            <td>
              {e.type === 'SURCHARGE' ? (
                <span className="badge red">补收</span>
              ) : (
                <span className="badge teal">退款</span>
              )}
            </td>
            <td className={e.type === 'SURCHARGE' ? 'amount-pos' : 'amount-neg'}>
              {e.type === 'SURCHARGE' ? '+' : '-'}
              {fmtMoney(e.amount)}
            </td>
            <td className="muted">
              {e.adjustmentLine?.adjustment.reason ?? '—'}
              {e.adjustmentLine?.adjustment.receiptNo
                ? `（回执 ${e.adjustmentLine.adjustment.receiptNo}）`
                : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ResidentApp({ user, onLogout }: { user: UserInfo; onLogout: () => void }) {
  const [route, setRoute] = useState<Route>({ view: 'bills' });
  const [bills, setBills] = useState<Bill[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    api<Bill[]>('/bills').then(setBills).catch((e) => setError(e.message));
    api<LedgerEntry[]>('/ledger').then(setLedger).catch(() => {});
    api<AppNotification[]>('/notifications').then(setNotifications).catch(() => {});
  }, []);

  useEffect(reload, [reload, route.view]);

  const unread = notifications.filter((n) => !n.isRead).length;

  const navBtn = (view: Route['view'], label: string, badgeCount = 0) => (
    <button className={route.view === view ? 'active' : ''} onClick={() => setRoute({ view } as Route)}>
      {label}
      {badgeCount > 0 ? ` (${badgeCount})` : ''}
    </button>
  );

  return (
    <Shell
      user={user}
      onLogout={onLogout}
      nav={
        <>
          {navBtn('bills', '我的账单')}
          {navBtn('ledger', '补退流水')}
          {navBtn('notifications', '通知', unread)}
        </>
      }
    >
      {error && <div className="error-box">{error}</div>}

      {route.view === 'bills' && (
        <div className="card">
          <h2>我的账单</h2>
          <p className="muted">户号 {user.accountNo} · {user.address}</p>
          <table>
            <thead>
              <tr>
                <th>账期</th>
                <th>期初读数</th>
                <th>期末读数</th>
                <th>用量(m³)</th>
                <th>金额</th>
                <th>状态</th>
                <th>异议</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id} className="clickable" onClick={() => setRoute({ view: 'bill', id: b.id })}>
                  <td>{b.period}</td>
                  <td>{b.startValue}</td>
                  <td>{b.endValue}</td>
                  <td>{b.usage}</td>
                  <td>{fmtMoney(b.amount)}</td>
                  <td><BillStatusBadge status={b.status} /></td>
                  <td>
                    {b.openDispute ? <DisputeStatusBadge status={b.openDispute.status} /> : <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {route.view === 'ledger' && (
        <div className="card">
          <h2>补退流水</h2>
          <p className="muted">复核调整产生的补收与退款分别记账，可逐笔核对。</p>
          <LedgerTable entries={ledger} />
        </div>
      )}

      {route.view === 'notifications' && (
        <div className="card">
          <h2>通知</h2>
          {notifications.length === 0 && <p className="muted">暂无通知</p>}
          {notifications.map((n) => (
            <div
              key={n.id}
              className="card"
              style={{ marginBottom: 8, opacity: n.isRead ? 0.65 : 1, cursor: 'pointer' }}
              onClick={() => {
                api(`/notifications/${n.id}/read`, { method: 'POST' }).then(reload);
              }}
            >
              <div>{n.message}</div>
              <div className="muted" style={{ marginTop: 4 }}>{fmtTime(n.createdAt)}{n.isRead ? ' · 已读' : ' · 未读（点击标记已读）'}</div>
            </div>
          ))}
        </div>
      )}

      {route.view === 'bill' && (
        <BillDetail
          billId={route.id}
          user={user}
          onBack={() => setRoute({ view: 'bills' })}
          onOpenDispute={(id) => setRoute({ view: 'dispute', id })}
        />
      )}

      {route.view === 'dispute' && (
        <DisputeDetail
          disputeId={route.id}
          user={user}
          onBack={() => setRoute({ view: 'bills' })}
        />
      )}
    </Shell>
  );
}
