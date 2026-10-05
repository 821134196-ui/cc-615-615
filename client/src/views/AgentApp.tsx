import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import {
  AppNotification,
  DISPUTE_STATUS_TEXT,
  DisputeListItem,
  fmtMoney,
  fmtTime,
  LedgerEntry,
  UserInfo,
} from '../types';
import { DisputeStatusBadge } from '../components/common';
import { Shell } from '../components/Shell';
import DisputeDetail from './DisputeDetail';
import { LedgerTable } from './ResidentApp';

type Route =
  | { view: 'queue' }
  | { view: 'ledger' }
  | { view: 'outbox' }
  | { view: 'dispute'; id: string };

const FILTERS = ['全部', 'SUBMITTED', 'REVIEW_SCHEDULED', 'CONCLUSION_REACHED', 'CLOSED'] as const;

export default function AgentApp({ user, onLogout }: { user: UserInfo; onLogout: () => void }) {
  const [route, setRoute] = useState<Route>({ view: 'queue' });
  const [disputes, setDisputes] = useState<DisputeListItem[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [outbox, setOutbox] = useState<(AppNotification & { residentId: string })[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('全部');
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    api<DisputeListItem[]>('/disputes').then(setDisputes).catch((e) => setError(e.message));
    api<LedgerEntry[]>('/ledger').then(setLedger).catch(() => {});
    api<typeof outbox>('/mock/notify/outbox').then(setOutbox).catch(() => {});
  }, []);

  useEffect(reload, [reload, route.view]);

  const shown = filter === '全部' ? disputes : disputes.filter((d) => d.status === filter);

  return (
    <Shell
      user={user}
      onLogout={onLogout}
      nav={
        <>
          <button className={route.view === 'queue' ? 'active' : ''} onClick={() => setRoute({ view: 'queue' })}>异议工单</button>
          <button className={route.view === 'ledger' ? 'active' : ''} onClick={() => setRoute({ view: 'ledger' })}>补退流水</button>
          <button className={route.view === 'outbox' ? 'active' : ''} onClick={() => setRoute({ view: 'outbox' })}>通知发件箱</button>
        </>
      }
    >
      {error && <div className="error-box">{error}</div>}

      {route.view === 'queue' && (
        <div className="card">
          <div className="header-line">
            <h2>异议工单</h2>
            <div>
              {FILTERS.map((f) => (
                <button
                  key={f}
                  className={`btn small ${filter === f ? '' : 'secondary'}`}
                  style={{ marginLeft: 6 }}
                  onClick={() => setFilter(f)}
                >
                  {f === '全部' ? '全部' : DISPUTE_STATUS_TEXT[f]}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 && <p className="muted">暂无工单</p>}
          {shown.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>提交时间</th>
                  <th>住户</th>
                  <th>户号</th>
                  <th>账期</th>
                  <th>账单金额</th>
                  <th>异议原因</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => (
                  <tr key={d.id} className="clickable" onClick={() => setRoute({ view: 'dispute', id: d.id })}>
                    <td className="muted">{fmtTime(d.createdAt)}</td>
                    <td>{d.resident.user.name}</td>
                    <td>{d.resident.accountNo}</td>
                    <td>{d.bill.period}</td>
                    <td>{fmtMoney(d.bill.amount)}</td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.reason}</td>
                    <td><DisputeStatusBadge status={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {route.view === 'ledger' && (
        <div className="card">
          <h2>补退流水（全部住户）</h2>
          <LedgerTable entries={ledger} />
        </div>
      )}

      {route.view === 'outbox' && (
        <div className="card">
          <h2>通知发件箱（模拟通知接口）</h2>
          {outbox.length === 0 && <p className="muted">暂无已发送通知</p>}
          {outbox.map((n) => (
            <div key={n.id} className="card" style={{ marginBottom: 8 }}>
              <div>{n.message}</div>
              <div className="muted" style={{ marginTop: 4 }}>→ 住户 {n.residentId.slice(-6)} · {fmtTime(n.createdAt)}</div>
            </div>
          ))}
        </div>
      )}

      {route.view === 'dispute' && (
        <DisputeDetail disputeId={route.id} user={user} onBack={() => setRoute({ view: 'queue' })} />
      )}
    </Shell>
  );
}
