import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import {
  Dispute,
  EVENT_TEXT,
  fmtDelta,
  fmtMoney,
  fmtTime,
  ReadingPoint,
  Receipt,
  UserInfo,
} from '../types';
import { BillStatusBadge, DisputeStatusBadge, MeterPhoto } from '../components/common';

export default function DisputeDetail({
  disputeId,
  user,
  onBack,
}: {
  disputeId: string;
  user: UserInfo;
  onBack: () => void;
}) {
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(() => {
    api<Dispute>(`/disputes/${disputeId}`).then(setDispute).catch((e) => setError(e.message));
  }, [disputeId]);

  useEffect(load, [load]);

  if (!dispute) return <div className="card">{error ? <div className="error-box">{error}</div> : '加载中…'}</div>;

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    setError('');
    setOk('');
    try {
      await fn();
      setOk(okMsg);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div className="card">
        <div className="header-line">
          <h2>异议工单 · 账期 {dispute.bill.period}</h2>
          <div>
            <DisputeStatusBadge status={dispute.status} />{' '}
            <button className="btn secondary small" onClick={onBack}>返回</button>
          </div>
        </div>
        {error && <div className="error-box">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}
        <div className="kv">
          <div className="item"><div className="k">原账单金额</div><div className="v">{fmtMoney(dispute.bill.amount)}</div></div>
          <div className="item"><div className="k">原用量</div><div className="v">{dispute.bill.usage} m³</div></div>
          <div className="item"><div className="k">账单状态</div><div className="v"><BillStatusBadge status={dispute.bill.status} /></div></div>
          <div className="item"><div className="k">提交时间</div><div className="v" style={{ fontSize: 14 }}>{fmtTime(dispute.createdAt)}</div></div>
        </div>
        <p><strong>异议原因：</strong>{dispute.reason}</p>
        {dispute.reviewTask && (
          <p className="muted">
            现场复核：{dispute.reviewTask.assigneeName ?? '—'} 受理
            {dispute.reviewTask.scheduledAt ? ` · 预约 ${fmtTime(dispute.reviewTask.scheduledAt)}` : ''}
            {dispute.reviewTask.completedAt ? ` · 完成 ${fmtTime(dispute.reviewTask.completedAt)}` : ''}
          </p>
        )}
        {dispute.status !== 'CLOSED' && (
          <p className="muted">复核未完成或住户未确认结论前，本申请不会自动关闭。</p>
        )}
      </div>

      {dispute.adjustments.length > 0 && (
        <div className="card">
          <h3>调整单与补退明细</h3>
          {dispute.adjustments.map((a) => (
            <div key={a.id} className="card" style={{ background: '#fafbfd' }}>
              <div className="header-line">
                <strong>调整原因：{a.reason}</strong>
                <span>
                  合计{' '}
                  <span className={a.totalDelta > 0 ? 'amount-pos' : a.totalDelta < 0 ? 'amount-neg' : ''}>
                    {fmtDelta(a.totalDelta)}
                  </span>
                </span>
              </div>
              <table style={{ marginTop: 8 }}>
                <thead>
                  <tr><th>账期</th><th>原用量</th><th>更正用量</th><th>原金额</th><th>更正金额</th><th>差额</th><th>入账</th></tr>
                </thead>
                <tbody>
                  {a.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.period}</td>
                      <td>{l.prevUsage} m³</td>
                      <td>{l.newUsage} m³</td>
                      <td>{fmtMoney(l.prevAmount)}</td>
                      <td>{fmtMoney(l.newAmount)}</td>
                      <td className={l.delta > 0 ? 'amount-pos' : 'amount-neg'}>{fmtDelta(l.delta)}</td>
                      <td>
                        {l.ledgerEntry ? (
                          l.ledgerEntry.type === 'SURCHARGE' ? (
                            <span className="badge red">补收 {fmtMoney(l.ledgerEntry.amount)}</span>
                          ) : (
                            <span className="badge teal">退款 {fmtMoney(l.ledgerEntry.amount)}</span>
                          )
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">回执号 {a.receiptNo} · {fmtTime(a.createdAt)} · 原账单与原始抄表照片仍保留可查</p>
            </div>
          ))}
        </div>
      )}

      <div className="split">
        <div className="card">
          <h3>处理记录</h3>
          <ul className="timeline">
            {dispute.events.map((e) => (
              <li key={e.id}>
                <div><strong>{EVENT_TEXT[e.action] ?? e.action}</strong> · {e.actorName}</div>
                {e.note && <div>{e.note}</div>}
                <div className="t">{fmtTime(e.createdAt)}</div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          {user.role === 'RESIDENT' && dispute.status === 'CONCLUSION_REACHED' && (
            <ResidentConfirm
              onAccept={() => act(() => api(`/disputes/${disputeId}/accept`, { method: 'POST' }), '已确认结论，申请关闭。')}
              onReject={(note) => act(() => api(`/disputes/${disputeId}/reject`, { method: 'POST', body: { note } }), '已退回重新受理，客服会再次跟进。')}
            />
          )}
          {user.role === 'AGENT' && dispute.status === 'SUBMITTED' && (
            <AgentSchedule onSchedule={(scheduledAt, note) => act(() => api(`/disputes/${disputeId}/schedule`, { method: 'POST', body: { scheduledAt, note } }), '已安排现场复核并通知住户。')} />
          )}
          {user.role === 'AGENT' && dispute.status === 'REVIEW_SCHEDULED' && (
            <AgentReview
              dispute={dispute}
              onDone={(msg) => { setOk(msg); load(); }}
              onError={setError}
            />
          )}
        </div>
      </div>
    </>
  );
}

function ResidentConfirm({ onAccept, onReject }: { onAccept: () => void; onReject: (note: string) => void }) {
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  return (
    <div className="card">
      <h3>复核结论待您确认</h3>
      <p className="muted">请核对上方调整单与补退明细。接受结论后申请才会关闭；如仍有异议可退回，系统不会自动关闭您的申请。</p>
      <button className="btn" onClick={onAccept}>接受结论并关闭</button>{' '}
      <button className="btn danger" onClick={() => setRejecting(!rejecting)}>仍有异议</button>
      {rejecting && (
        <>
          <label>请说明仍有异议的原因：</label>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <div style={{ marginTop: 8 }}>
            <button className="btn danger" disabled={!note.trim()} onClick={() => onReject(note)}>退回重新受理</button>
          </div>
        </>
      )}
    </div>
  );
}

function AgentSchedule({ onSchedule }: { onSchedule: (at: string, note: string) => void }) {
  const [at, setAt] = useState('');
  const [note, setNote] = useState('');
  return (
    <div className="card">
      <h3>安排现场复核</h3>
      <label>预约上门时间</label>
      <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
      <label>备注（可选）</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：已电话预约住户" />
      <div style={{ marginTop: 10 }}>
        <button className="btn" disabled={!at} onClick={() => onSchedule(new Date(at).toISOString(), note)}>
          受理并预约
        </button>
      </div>
    </div>
  );
}

function AgentReview({
  dispute,
  onDone,
  onError,
}: {
  dispute: Dispute;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [estimated, setEstimated] = useState<ReadingPoint[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptNo, setReceiptNo] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('现场复核确认估抄读数偏差，按实际读数更正');
  const [noErrorNote, setNoErrorNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ readings: ReadingPoint[] }>(`/bills/${dispute.billId}/readings`).then((d) => {
      const est = d.readings.filter((r) => r.kind === 'ESTIMATED' && !r.supersededById);
      setEstimated(est);
      setValues(Object.fromEntries(est.map((r) => [r.id, String(r.value)])));
    });
    api<Receipt[]>(`/mock/receipts/${dispute.bill.meterId}`).then(setReceipts);
  }, [dispute.billId, dispute.bill.meterId]);

  useEffect(load, [load]);

  const usableReceipts = receipts.filter((r) => !r.consumedByAdjustmentId);

  const callMeterApi = async () => {
    setBusy(true);
    try {
      const r = await api<Receipt>('/mock/meter-reading/onsite', {
        method: 'POST',
        body: { meterId: dispute.bill.meterId },
      });
      setReceiptNo(r.receiptNo);
      await api<Receipt[]>(`/mock/receipts/${dispute.bill.meterId}`).then(setReceipts);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const corrections = estimated
      .filter((r) => Number(values[r.id]) !== r.value)
      .map((r) => ({ readingId: r.id, value: Number(values[r.id]) }));
    if (!receiptNo) return onError('请先通过模拟抄表接口获取现场复核回执');
    if (corrections.length === 0) return onError('请至少修改一条估抄读数；若读数无误请使用下方"读数无误"结论');
    setBusy(true);
    try {
      await api(`/disputes/${dispute.id}/complete-review`, {
        method: 'POST',
        body: { receiptNo, corrections, reason },
      });
      onDone('复核完成，调整单已生成并通知住户。');
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitNoError = async () => {
    if (!noErrorNote.trim()) return onError('请填写复核说明');
    setBusy(true);
    try {
      await api(`/disputes/${dispute.id}/no-error`, {
        method: 'POST',
        body: { note: noErrorNote },
      });
      onDone('已提交"读数无误"结论，待住户确认。');
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const selectedReceipt = receipts.find((r) => r.receiptNo === receiptNo);

  return (
    <>
      <div className="card">
        <h3>现场复核 · 生成调整单</h3>
        <p className="muted">第一步：调用模拟抄表接口上门抄表，获取带回执号的现场读数。</p>
        <button className="btn secondary" disabled={busy} onClick={callMeterApi}>调用抄表接口获取回执</button>
        {usableReceipts.length > 0 && (
          <>
            <label>选择回执（每个回执只能用于一次调整）</label>
            <select value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)}>
              <option value="">— 请选择 —</option>
              {usableReceipts.map((r) => (
                <option key={r.receiptNo} value={r.receiptNo}>
                  {r.receiptNo} · 现场读数 {r.value} · {fmtTime(r.takenAt)}
                </option>
              ))}
            </select>
          </>
        )}
        {selectedReceipt && (
          <div style={{ marginTop: 10 }}>
            <MeterPhoto url={`/api/files/photos/${selectedReceipt.photoToken}`} caption={`现场照片 · 读数 ${selectedReceipt.value}`} />
          </div>
        )}

        <p className="muted" style={{ marginTop: 14 }}>第二步：根据现场读数更正估抄点（未修改的估抄点保持原值）。</p>
        {estimated.length === 0 && <p className="muted">该表计没有待更正的估抄读数。</p>}
        {estimated.map((r) => (
          <div key={r.id}>
            <label>{r.date.slice(0, 10)} 估抄读数（原值 {r.value}）</label>
            <input
              type="number"
              value={values[r.id] ?? ''}
              onChange={(e) => setValues({ ...values, [r.id]: e.target.value })}
            />
          </div>
        ))}

        <label>调整原因（展示给住户）</label>
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div style={{ marginTop: 10 }}>
          <button className="btn" disabled={busy} onClick={submit}>生成调整单</button>
        </div>
      </div>

      <div className="card">
        <h3>或：复核后确认读数无误</h3>
        <label>复核说明</label>
        <textarea rows={2} value={noErrorNote} onChange={(e) => setNoErrorNote(e.target.value)} placeholder="例如：现场读数与账单一致，表计走字正常" />
        <div style={{ marginTop: 10 }}>
          <button className="btn secondary" disabled={busy} onClick={submitNoError}>提交"读数无误"结论</button>
        </div>
      </div>
    </>
  );
}
