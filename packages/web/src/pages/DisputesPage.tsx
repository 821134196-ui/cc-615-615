import { useEffect, useState } from 'react';
import { api } from '../api';
import { Dispute, UserInfo } from '../types';
import { DISPUTE_STATUS_LABEL, periodLabel, signedYuan, statusTone, yuan } from '../format';
import { Modal } from '../components/Modal';
import { DisputePanel } from '../components/DisputePanel';

export function DisputesPage({ user }: { user: UserInfo }) {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setDisputes(await api<Dispute[]>('GET', '/disputes'));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <h2>{user.role === 'AGENT' ? '异议复核工作台' : '我的异议'}</h2>
        <span className="desc">
          {user.role === 'AGENT'
            ? '安排现场复核、录入实抄读数并生成调整单；未完成或住户仍有异议的申请不可关闭'
            : '按账期查看复核进度、调整原因与补退明细，确认结论或提出进一步异议'}
        </span>
      </div>

      <div className="card">
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              {user.role === 'AGENT' && <th>住户</th>}
              <th>表号</th>
              <th>异议账期</th>
              <th className="num">原金额（元）</th>
              <th className="num">调整净额（元）</th>
              <th>状态</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="muted">加载中…</td></tr>
            ) : disputes.length === 0 ? (
              <tr><td colSpan={8} className="muted">暂无异议申请。</td></tr>
            ) : (
              disputes.map((d) => (
                <tr key={d.id} className="clickable" onClick={() => setOpenId(d.id)}>
                  <td>{d.id}</td>
                  {user.role === 'AGENT' && (
                    <td>
                      {d.resident.displayName}
                      <span className="muted small">（{d.resident.username}）</span>
                    </td>
                  )}
                  <td>{d.bill.meter.meterNo}</td>
                  <td>{periodLabel(d.bill.periodKey)}</td>
                  <td className="num">¥{yuan(d.bill.amount)}</td>
                  <td
                    className={`num ${
                      d.adjustment
                        ? d.adjustment.totalDelta < 0
                          ? 'delta-refund'
                          : 'delta-surcharge'
                        : ''
                    }`}
                  >
                    {d.adjustment ? signedYuan(d.adjustment.totalDelta) : '—'}
                  </td>
                  <td>
                    <span className={`badge ${statusTone(d.status)}`}>{DISPUTE_STATUS_LABEL[d.status]}</span>
                  </td>
                  <td className="small muted">{new Date(d.updatedAt).toLocaleString('zh-CN', { hour12: false })}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {openId && (
        <Modal
          title={`异议申请 #${openId}`}
          subtitle="原账单金额 · 调整原因 · 补退明细 · 现场复核记录"
          onClose={() => setOpenId(null)}
          width={860}
        >
          <DisputeLoader id={openId} role={user.role} onChanged={load} />
        </Modal>
      )}
    </div>
  );
}

function DisputeLoader({ id, role, onChanged }: { id: number; role: 'RESIDENT' | 'AGENT'; onChanged: () => void }) {
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      setDispute(await api<Dispute>('GET', `/disputes/${id}`));
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (err) return <div className="error-box">{err}</div>;
  if (!dispute) return <div className="muted">加载中…</div>;
  return <DisputePanel dispute={dispute} role={role} onChanged={() => { load(); onChanged(); }} />;
}
