import { useEffect, useState } from 'react';
import { api } from '../api';
import { Bill, BillDetail, Dispute, MeterReading, UserInfo } from '../types';
import { periodLabel, signedYuan, yuan } from '../format';
import { Modal } from '../components/Modal';
import { PhotoThumb } from '../components/PhotoThumb';
import { ReadingCurve } from '../components/ReadingCurve';
import { ReadingBadge } from '../components/ReadingBadge';

export function BillsPage({ user }: { user: UserInfo }) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setBills(await api<Bill[]>('GET', '/bills'));
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <h2>我的账单</h2>
        <span className="desc">点击账期可查看原读数、抄表照片、读数曲线与调整明细</span>
      </div>

      <div className="card">
        <table className="data">
          <thead>
            <tr>
              <th>账期</th>
              <th>表号 / 地址</th>
              <th className="num">用量（m³）</th>
              <th className="num">单价（元）</th>
              <th className="num">原账单金额（元）</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="muted">加载中…</td></tr>
            ) : (
              bills.map((b) => (
                <tr key={b.id} className="clickable" onClick={() => setOpenId(b.id)}>
                  <td>{periodLabel(b.periodKey)}</td>
                  <td>
                    {b.meter.meterNo}
                    <span className="muted small"> · {b.meter.address}</span>
                  </td>
                  <td className="num">{b.usage}</td>
                  <td className="num">{yuan(b.unitPrice)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>¥{yuan(b.amount)}</td>
                  <td>
                    {b.status === 'ADJUSTED' ? (
                      <span className="badge tone-warning">已调整（原单保留）</span>
                    ) : (
                      <span className="badge tone-muted">原始账单</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {openId && (
        <BillDetailModal
          billId={openId}
          user={user}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function BillDetailModal({
  billId,
  user,
  onClose,
  onChanged,
}: {
  billId: number;
  user: UserInfo;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<BillDetail | null>(null);
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [showDispute, setShowDispute] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const d = await api<BillDetail>('GET', `/bills/${billId}`);
    setDetail(d);
    const [curve, mine] = await Promise.all([
      api<MeterReading[]>('GET', `/bills/meter/${d.meter.id}/readings`),
      api<Dispute[]>('GET', '/disputes'),
    ]);
    setReadings(curve);
    setDisputes(mine.filter((x) => x.bill.id === billId));
  };

  useEffect(() => {
    load();
  }, [billId]);

  const openDispute = disputes.find((d) => d.status !== 'CLOSED');

  const submit = async () => {
    if (!reason.trim()) {
      setErr('请填写异议原因');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await api('POST', '/disputes', { billId, reason: reason.trim() });
      setShowDispute(false);
      setReason('');
      await load();
      onChanged();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!detail) {
    return (
      <Modal title="账单详情" onClose={onClose}>
        <div className="muted">加载中…</div>
      </Modal>
    );
  }

  return (
    <Modal
      title={`${periodLabel(detail.periodKey)} 账单详情`}
      subtitle={`${detail.meter.meterNo} · ${detail.meter.address}`}
      onClose={onClose}
      width={820}
    >
      <div className="amount-grid">
        <div className="stat">
          <div className="k">原账单金额</div>
          <div className="v">¥{yuan(detail.amount)}</div>
        </div>
        <div className="stat">
          <div className="k">本期用量</div>
          <div className="v">{detail.usage} m³</div>
        </div>
        <div className="stat">
          <div className="k">期初读数</div>
          <div className="v">{detail.startReading?.value ?? '—'}</div>
        </div>
        <div className="stat">
          <div className="k">期末读数</div>
          <div className="v">{detail.endReading?.value ?? '—'}</div>
        </div>
      </div>

      <div className="card" style={{ boxShadow: 'none', marginBottom: 12 }}>
        <h3>原抄表读数与照片（永久保留）</h3>
        <table className="data" style={{ marginBottom: 10 }}>
          <thead>
            <tr><th>读数</th><th>账期</th><th>类型</th><th>抄表时间</th></tr>
          </thead>
          <tbody>
            {[detail.startReading, detail.endReading].filter(Boolean).map((r) => (
              <tr key={r!.id}>
                <td style={{ fontWeight: 600 }}>{r!.value} m³</td>
                <td>{r!.periodKey}</td>
                <td><ReadingBadge reading={r!} /></td>
                <td>{new Date(r!.readAt).toLocaleString('zh-CN', { hour12: false })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="photo-grid">
          {detail.startReading?.photo && (
            <PhotoThumb photoId={detail.startReading.photo.id} caption={`期初读数照片（${detail.startReading.periodKey}）`} />
          )}
          {detail.endReading?.photo && (
            <PhotoThumb photoId={detail.endReading.photo.id} caption={`期末读数照片（${detail.endReading.periodKey}）`} />
          )}
        </div>
      </div>

      <div className="card" style={{ boxShadow: 'none', marginBottom: 12 }}>
        <h3>读数曲线</h3>
        <ReadingCurve readings={readings} />
        <p className="muted small" style={{ marginTop: 8 }}>
          橙色点/线段为估抄，蓝色为实抄；带白环圆点为现场复核实抄读数。悬停可查看每账期全部读数与回执。
        </p>
      </div>

      {detail.adjustmentLines.length > 0 && (
        <div className="card" style={{ boxShadow: 'none', marginBottom: 12 }}>
          <h3>补退明细</h3>
          <table className="data">
            <thead>
              <tr>
                <th>账期</th>
                <th>类型</th>
                <th className="num">用量差（m³）</th>
                <th className="num">金额差（元）</th>
                <th>流水状态</th>
              </tr>
            </thead>
            <tbody>
              {detail.adjustmentLines.map((l) => (
                <tr key={l.id}>
                  <td>{periodLabel(l.periodKey)}</td>
                  <td>
                    <span className={`badge ${l.kind === 'REFUND' ? 'tone-good' : 'tone-critical'}`}>
                      {l.kind === 'REFUND' ? '退款' : '跨期补收'}
                    </span>
                  </td>
                  <td className="num">{l.deltaUsage > 0 ? `+${l.deltaUsage}` : l.deltaUsage}</td>
                  <td className={`num ${l.kind === 'REFUND' ? 'delta-refund' : 'delta-surcharge'}`}>{signedYuan(l.deltaAmount)}</td>
                  <td>{l.ledgerEntry ? '已入账' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small" style={{ marginBottom: 0 }}>
            原账单金额 ¥{yuan(detail.amount)} 为出账时快照，不做修改；补收款与退款以流水分别列示，可在“费用流水”页核对。
          </p>
        </div>
      )}

      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
        {user.role === 'AGENT' ? (
          <span className="muted small">客服视图：账单快照、读数曲线与调整明细只读，处理请到“异议复核”页。</span>
        ) : openDispute ? (
          <span className="badge tone-info">该账期异议处理中（状态：{openDispute.status}），请到“我的异议”查看</span>
        ) : disputes.some((d) => d.status === 'CLOSED') ? (
          <span className="badge tone-muted">该账期异议已关闭</span>
        ) : (
          <button className="btn btn-primary" onClick={() => setShowDispute(true)}>
            对本账期费用提交异议
          </button>
        )}
      </div>

      {showDispute && (
        <Modal title="提交账单异议" subtitle={periodLabel(detail.periodKey)} onClose={() => setShowDispute(false)} width={520}>
          {err && <div className="error-box">{err}</div>}
          <div className="field">
            <label>异议原因（必填）</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：8 月用量明显高于平时，怀疑估抄偏高，要求上门复核"
            />
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setShowDispute(false)}>取消</button>
            <button className="btn btn-primary" disabled={busy} onClick={submit}>
              提交异议
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
