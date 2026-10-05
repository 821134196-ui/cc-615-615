import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import {
  Adjustment,
  AdjustmentLine,
  Bill,
  fmtDelta,
  fmtMoney,
  fmtTime,
  LedgerEntry,
  ReadingPoint,
  UserInfo,
} from '../types';
import { BillStatusBadge, DisputeStatusBadge, MeterPhoto } from '../components/common';
import ReadingCurve from '../components/ReadingCurve';

interface BillDetailData extends Bill {
  adjustmentLines: (AdjustmentLine & { adjustment: Adjustment; ledgerEntry: LedgerEntry | null })[];
  ledgerEntries: LedgerEntry[];
  disputes: { id: string; status: string; reason: string; createdAt: string }[];
}

interface ReadingsData {
  billPeriod: string;
  startReadingId: string;
  endReadingId: string;
  readings: ReadingPoint[];
}

export default function BillDetail({
  billId,
  user,
  onBack,
  onOpenDispute,
}: {
  billId: string;
  user: UserInfo;
  onBack: () => void;
  onOpenDispute: (id: string) => void;
}) {
  const [bill, setBill] = useState<BillDetailData | null>(null);
  const [curve, setCurve] = useState<ReadingsData | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    api<BillDetailData>(`/bills/${billId}`).then(setBill).catch((e) => setError(e.message));
    api<ReadingsData>(`/bills/${billId}/readings`).then(setCurve).catch(() => {});
  }, [billId]);

  useEffect(load, [load]);

  if (!bill) return <div className="card">{error ? <div className="error-box">{error}</div> : '加载中…'}</div>;

  const openDispute = bill.disputes.find((d) => d.status !== 'CLOSED');
  const photos = (curve?.readings ?? []).filter(
    (r) => r.photoUrl && (r.id === curve?.startReadingId || r.id === curve?.endReadingId),
  );

  const submitDispute = async () => {
    setSubmitting(true);
    setError('');
    try {
      const d = await api<{ id: string }>('/disputes', {
        method: 'POST',
        body: { billId, reason },
      });
      setOk('异议已提交，客服将尽快受理。');
      onOpenDispute(d.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="card">
        <div className="header-line">
          <h2>账单 {bill.period}</h2>
          <div>
            <BillStatusBadge status={bill.status} />{' '}
            <button className="btn secondary small" onClick={onBack}>返回列表</button>
          </div>
        </div>
        <div className="kv">
          <div className="item"><div className="k">期初读数</div><div className="v">{bill.startValue}</div></div>
          <div className="item"><div className="k">期末读数</div><div className="v">{bill.endValue}</div></div>
          <div className="item"><div className="k">用量</div><div className="v">{bill.usage} m³</div></div>
          <div className="item"><div className="k">单价</div><div className="v">{fmtMoney(bill.unitPrice)}/m³</div></div>
          <div className="item"><div className="k">原账单金额</div><div className="v">{fmtMoney(bill.amount)}</div></div>
          <div className="item"><div className="k">表计编号</div><div className="v">{bill.meter?.meterNo}</div></div>
        </div>
      </div>

      <div className="card">
        <h3>读数曲线（估抄 / 实抄）</h3>
        {curve && (
          <ReadingCurve
            readings={curve.readings}
            startReadingId={curve.startReadingId}
            endReadingId={curve.endReadingId}
          />
        )}
        {photos.length > 0 && (
          <>
            <h3>原始抄表照片</h3>
            <div className="photo-grid">
              {photos.map((p) => (
                <MeterPhoto key={p.id} url={p.photoUrl!} caption={`${p.date.slice(0, 10)} 读数 ${p.value}`} />
              ))}
            </div>
          </>
        )}
      </div>

      {bill.adjustmentLines.length > 0 && (
        <div className="card">
          <h3>复核调整明细（本账期）</h3>
          {bill.adjustmentLines.map((l) => (
            <div key={l.id} className="card" style={{ background: '#fafbfd' }}>
              <div className="header-line">
                <strong>调整原因：{l.adjustment.reason}</strong>
                <span className={l.delta > 0 ? 'amount-pos' : 'amount-neg'}>{fmtDelta(l.delta)}</span>
              </div>
              <table style={{ marginTop: 8 }}>
                <thead>
                  <tr><th>账期</th><th>原用量</th><th>更正用量</th><th>原金额</th><th>更正金额</th><th>差额</th><th>入账</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{l.period}</td>
                    <td>{l.prevUsage} m³</td>
                    <td>{l.newUsage} m³</td>
                    <td>{fmtMoney(l.prevAmount)}</td>
                    <td>{fmtMoney(l.newAmount)}</td>
                    <td className={l.delta > 0 ? 'amount-pos' : 'amount-neg'}>{fmtDelta(l.delta)}</td>
                    <td>
                      {l.ledgerEntry ? (
                        l.ledgerEntry.type === 'SURCHARGE' ? <span className="badge red">补收</span> : <span className="badge teal">退款</span>
                      ) : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="muted">回执号 {l.adjustment.receiptNo} · {fmtTime(l.adjustment.createdAt)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3>账单异议</h3>
        {ok && <div className="ok-box">{ok}</div>}
        {error && <div className="error-box">{error}</div>}
        {bill.disputes.length > 0 && (
          <table>
            <thead>
              <tr><th>提交时间</th><th>异议原因</th><th>状态</th><th></th></tr>
            </thead>
            <tbody>
              {bill.disputes.map((d) => (
                <tr key={d.id}>
                  <td className="muted">{fmtTime(d.createdAt)}</td>
                  <td>{d.reason}</td>
                  <td><DisputeStatusBadge status={d.status} /></td>
                  <td>
                    <button className="btn secondary small" onClick={() => onOpenDispute(d.id)}>查看</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!openDispute && user.role === 'RESIDENT' && (
          <>
            <label>对本账期费用有疑问？说明情况后提交，客服将调取抄表记录并安排现场复核：</label>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：本月用气量突然比往常高很多，怀疑估抄不准…" />
            <div style={{ marginTop: 10 }}>
              <button className="btn" disabled={submitting || !reason.trim()} onClick={submitDispute}>
                提交异议
              </button>
            </div>
          </>
        )}
        {openDispute && (
          <p className="muted" style={{ marginTop: 8 }}>
            当前有进行中的异议，复核未完成前不会自动关闭。
          </p>
        )}
      </div>
    </>
  );
}
