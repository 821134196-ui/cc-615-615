import { useEffect, useState } from 'react';
import { api } from '../api';
import { LedgerEntry } from '../types';
import { LEDGER_TYPE_LABEL, periodLabel, signedYuan } from '../format';

export function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    api<LedgerEntry[]>('GET', '/ledger').then(setEntries);
  }, []);

  const refundTotal = entries.filter((e) => e.type === 'REFUND').reduce((s, e) => s + e.amount, 0);
  const surchargeTotal = entries.filter((e) => e.type === 'SURCHARGE').reduce((s, e) => s + e.amount, 0);
  const chargeTotal = entries.filter((e) => e.type === 'CHARGE').reduce((s, e) => s + e.amount, 0);

  return (
    <div className="page">
      <div className="page-head">
        <h2>费用流水</h2>
        <span className="desc">原账单扣费、跨期补收、退款分别记账，流水记录不删改</span>
      </div>

      <div className="amount-grid">
        <div className="stat">
          <div className="k">原账单扣费合计</div>
          <div className="v">¥{(chargeTotal / 100).toFixed(2)}</div>
        </div>
        <div className="stat">
          <div className="k">跨期补收合计</div>
          <div className="v surcharge">¥{(surchargeTotal / 100).toFixed(2)}</div>
        </div>
        <div className="stat">
          <div className="k">退款合计</div>
          <div className="v refund">¥{(-refundTotal / 100).toFixed(2)}</div>
        </div>
      </div>

      <div className="card">
        <table className="data">
          <thead>
            <tr>
              <th>时间</th>
              <th>账期</th>
              <th>表号</th>
              <th>类型</th>
              <th className="num">金额（元）</th>
              <th>幂等凭证</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={6} className="muted">暂无流水。</td></tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id}>
                  <td className="small">{new Date(e.createdAt).toLocaleString('zh-CN', { hour12: false })}</td>
                  <td>{periodLabel(e.periodKey)}</td>
                  <td>{e.bill?.meterNo ?? '—'}</td>
                  <td>
                    <span
                      className={`badge ${
                        e.type === 'REFUND' ? 'tone-good' : e.type === 'SURCHARGE' ? 'tone-critical' : 'tone-muted'
                      }`}
                    >
                      {LEDGER_TYPE_LABEL[e.type]}
                    </span>
                  </td>
                  <td
                    className={`num ${
                      e.type === 'REFUND' ? 'delta-refund' : e.type === 'SURCHARGE' ? 'delta-surcharge' : ''
                    }`}
                  >
                    {signedYuan(e.amount)}
                  </td>
                  <td className="small muted">
                    <code>{e.idempotencyKey}</code>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
