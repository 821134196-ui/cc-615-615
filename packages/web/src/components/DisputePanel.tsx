import { useState } from 'react';
import { api } from '../api';
import { Dispute } from '../types';
import {
  DISPUTE_STATUS_LABEL,
  dateTime,
  periodLabel,
  signedYuan,
  statusTone,
  yuan,
} from '../format';
import { Modal } from './Modal';
import { PhotoThumb } from './PhotoThumb';

interface Props {
  dispute: Dispute;
  role: 'RESIDENT' | 'AGENT';
  onChanged: () => void;
}

export function DisputePanel({ dispute, role, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [modal, setModal] = useState<null | 'schedule' | 'errorFound' | 'noError' | 'agree' | 'disagree'>(null);

  const run = async (fn: () => Promise<any>, success?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setModal(null);
      if (success) setMsg({ ok: true, text: success });
      onChanged();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const bill = dispute.bill;
  const adj = dispute.adjustment;
  const lastReview = dispute.reviews[dispute.reviews.length - 1];

  return (
    <div>
      {msg && <div className={msg.ok ? 'ok-box' : 'error-box'}>{msg.text}</div>}

      <div className="row-actions" style={{ justifyContent: 'space-between' }}>
        <span className={`badge ${statusTone(dispute.status)}`}>{DISPUTE_STATUS_LABEL[dispute.status]}</span>
        <span className="muted small">申请编号 #{dispute.id} · 提交于 {dateTime(dispute.createdAt)}</span>
      </div>

      {/* 原账单金额 —— 快照保留不变 */}
      <div className="amount-grid">
        <div className="stat">
          <div className="k">原账单金额（{periodLabel(bill.periodKey)}）</div>
          <div className="v">¥{yuan(bill.amount)}</div>
        </div>
        <div className="stat">
          <div className="k">原计费用量</div>
          <div className="v">{bill.usage} m³</div>
        </div>
        <div className="stat">
          <div className="k">单价</div>
          <div className="v">¥{yuan(bill.unitPrice)}/m³</div>
        </div>
        <div className="stat">
          <div className="k">调整后净额变动</div>
          <div className={`v ${adj && adj.totalDelta < 0 ? 'refund' : adj && adj.totalDelta > 0 ? 'surcharge' : ''}`}>
            {adj ? `${signedYuan(adj.totalDelta)} 元` : '—'}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>异议内容</h3>
        <div className="kv">
          <div className="k">住户</div>
          <div>
            {dispute.resident.displayName}（{bill.meter.meterNo} · {bill.meter.address}）
          </div>
          <div className="k">异议账期</div>
          <div>{periodLabel(bill.periodKey)}</div>
          <div className="k">异议原因</div>
          <div>{dispute.reason}</div>
          {dispute.residentNote && (
            <>
              <div className="k">住户补充</div>
              <div>{dispute.residentNote}（{dateTime(dispute.residentDecidedAt)}）</div>
            </>
          )}
        </div>
      </div>

      {/* 调整原因 + 补退明细 —— 与原金额放在同一页方便核对 */}
      {adj && (
        <div className="card">
          <h3>调整单与补退明细</h3>
          <div className="kv" style={{ marginBottom: 12 }}>
            <div className="k">调整原因</div>
            <div>{adj.reason}</div>
            <div className="k">抄表回执</div>
            <div>
              <code>{adj.receiptNo}</code>（{dateTime(adj.appliedAt)} 生效）
            </div>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th>账期</th>
                <th>类型</th>
                <th className="num">用量差（m³）</th>
                <th className="num">金额差</th>
                <th>流水</th>
              </tr>
            </thead>
            <tbody>
              {adj.lines.map((l) => (
                <tr key={l.id}>
                  <td>{periodLabel(l.periodKey)}</td>
                  <td>
                    <span className={`badge ${l.kind === 'REFUND' ? 'tone-good' : 'tone-critical'}`}>
                      {l.kind === 'REFUND' ? '退款' : '跨期补收'}
                    </span>
                  </td>
                  <td className="num">{l.deltaUsage > 0 ? `+${l.deltaUsage}` : l.deltaUsage}</td>
                  <td className={`num ${l.kind === 'REFUND' ? 'delta-refund' : 'delta-surcharge'}`}>
                    {signedYuan(l.deltaAmount)} 元
                  </td>
                  <td>{l.ledgerEntry ? `已入账（${l.ledgerEntry.type === 'REFUND' ? '退款流水' : '补收流水'}）` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small" style={{ margin: '10px 0 0' }}>
            说明：表具读数为累计值，修正某账期期末读数后，用量差在相邻两个账期间平移：
            当期退/补，次期反向补/退，两条流水分别记账；原账单金额与原始抄表照片均保留不删改。
          </p>
        </div>
      )}

      {/* 现场复核流程 */}
      <div className="card">
        <h3>现场复核记录</h3>
        {dispute.reviews.length === 0 ? (
          <div className="muted small">尚未安排现场复核。</div>
        ) : (
          <div className="flow">
            {dispute.reviews.map((r, idx) => (
              <div key={r.id} className={`flow-item ${r.completedAt ? 'done' : ''}`}>
                <div className="flow-dot">{idx + 1}</div>
                <div className="flow-body">
                  <div className="t">
                    第 {idx + 1} 次现场复核 · {r.completedAt ? '已完成' : '待上门'}
                  </div>
                  <div className="m">
                    预约时间：{dateTime(r.scheduledAt)}
                    {r.completedAt ? ` · 完成于 ${dateTime(r.completedAt)}` : ''}
                  </div>
                  {r.result && (
                    <div className="m">
                      结论：
                      {r.result === 'NO_ERROR' ? (
                        <span className="badge tone-muted" style={{ marginLeft: 6 }}>读数无误</span>
                      ) : (
                        <span className="badge tone-warning" style={{ marginLeft: 6 }}>读数有误，已调整</span>
                      )}
                      {r.receiptNo && (
                        <>
                          {' '}· 回执 <code>{r.receiptNo}</code>
                        </>
                      )}
                    </div>
                  )}
                  {r.note && <div className="m">备注：{r.note}</div>}
                  {r.correctedReading && (
                    <div style={{ marginTop: 8 }}>
                      <div className="small muted">
                        现场实抄表具累计读数 <strong>{r.correctedReading.value} m³</strong>
                        （原期末读数与调整差额见上方调整单）
                      </div>
                      {r.correctedReading.photo && (
                        <div className="photo-grid">
                          <PhotoThumb
                            photoId={r.correctedReading.photo.id}
                            caption={`现场复核照片（回执 ${r.receiptNo ?? ''}）`}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {lastReview?.result === 'ERROR_FOUND' && adj && (
          <p className="notice-bar" style={{ marginTop: 12 }}>
            现场实抄读数已写入读数曲线（标为实抄），原估抄读数与原始照片继续保留，可在读数页对照查看。
          </p>
        )}
      </div>

      {/* 操作区：按角色与状态严格控制；无自动关闭入口 */}
      <div className="card">
        <h3>处理操作</h3>
        <div className="row-actions">
          {role === 'AGENT' && (dispute.status === 'SUBMITTED' || dispute.status === 'DISPUTED_AGAIN') && (
            <button className="btn btn-primary" onClick={() => setModal('schedule')}>
              安排现场复核
            </button>
          )}
          {role === 'AGENT' && dispute.status === 'SCHEDULED' && (
            <>
              <button className="btn btn-primary" onClick={() => setModal('errorFound')}>
                完成复核：读数有误（生成调整单）
              </button>
              <button className="btn" onClick={() => setModal('noError')}>
                完成复核：读数无误
              </button>
            </>
          )}
          {role === 'RESIDENT' && dispute.status === 'REVIEWED' && (
            <>
              <button className="btn btn-primary" onClick={() => setModal('agree')}>
                我认可复核结论
              </button>
              <button className="btn btn-danger" onClick={() => setModal('disagree')}>
                我对结论仍有异议
              </button>
            </>
          )}
          {role === 'AGENT' && dispute.status === 'RESOLVED' && (
            <button className="btn" onClick={() => run(() => api('PATCH', `/disputes/${dispute.id}/close`), '申请已关闭')}>
              关闭申请
            </button>
          )}
          {role === 'AGENT' &&
            (dispute.status === 'SUBMITTED' ||
              dispute.status === 'SCHEDULED' ||
              dispute.status === 'REVIEWED' ||
              dispute.status === 'DISPUTED_AGAIN') && (
              <span className="muted small">
                {dispute.status === 'DISPUTED_AGAIN'
                  ? '住户仍有异议：请重新安排现场复核，不能直接关闭。'
                  : dispute.status === 'REVIEWED'
                    ? '需住户确认结论后才能关闭，系统不会自动关闭。'
                    : '复核流程未完成，不能关闭申请。'}
              </span>
            )}
          {role === 'RESIDENT' && dispute.status !== 'REVIEWED' && dispute.status !== 'CLOSED' && (
            <span className="muted small">客服处理中，请留意通知。复核完成后可在此页确认结论或提出进一步异议。</span>
          )}
          {dispute.status === 'CLOSED' && <span className="muted small">申请已于 {dateTime(dispute.closedAt)} 关闭。</span>}
        </div>
      </div>

      {modal === 'schedule' && (
        <ScheduleModal
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(scheduledAt) =>
            run(() => api('POST', `/disputes/${dispute.id}/schedule`, { scheduledAt }), '现场复核已安排')
          }
        />
      )}
      {modal === 'errorFound' && (
        <ErrorFoundModal
          busy={busy}
          billUsage={bill.usage}
          onClose={() => setModal(null)}
          onSubmit={(dto) =>
            run(
              () => api('POST', `/disputes/${dispute.id}/complete-review`, { result: 'ERROR_FOUND', ...dto }),
              '复核完成：调整单已生成，补退已分别记入流水',
            )
          }
        />
      )}
      {modal === 'noError' && (
        <NoErrorModal
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(note) =>
            run(() => api('POST', `/disputes/${dispute.id}/complete-review`, { result: 'NO_ERROR', note }), '复核已完成：读数无误')
          }
        />
      )}
      {modal === 'agree' && (
        <ConfirmAgreeModal
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={() => run(() => api('POST', `/disputes/${dispute.id}/respond`, { agree: true }), '已确认结论')}
        />
      )}
      {modal === 'disagree' && (
        <DisagreeModal
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(note) =>
            run(() => api('POST', `/disputes/${dispute.id}/respond`, { agree: false, note }), '已登记异议，客服将重新安排复核')
          }
        />
      )}
    </div>
  );
}

function ScheduleModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (iso: string) => void }) {
  const [v, setV] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T09:00`;
  });
  return (
    <Modal title="安排现场复核" subtitle="预约后住户将收到通知" onClose={onClose} width={460}>
      <div className="field">
        <label>上门时间</label>
        <input type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => onSubmit(new Date(v).toISOString())}>
          确认安排
        </button>
      </div>
    </Modal>
  );
}

function ErrorFoundModal({
  busy,
  billUsage,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  billUsage: number;
  onClose: () => void;
  onSubmit: (dto: { correctedValue: number; reason: string; receiptNo?: string }) => void;
}) {
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('现场实抄确认原估抄读数有误');
  const [receipt, setReceipt] = useState('');
  return (
    <Modal
      title="完成现场复核：读数有误"
      subtitle="提交后将按现场实抄读数生成调整单，跨期补收/退款分别记入流水；同一回执不可重复使用"
      onClose={onClose}
    >
      <div className="field">
        <label>现场复核期末累计读数（m³，整数）</label>
        <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d-]/g, ''))} placeholder="例如 190" />
        <div className="muted small" style={{ marginTop: 4 }}>
          原账期计费用量 {billUsage} m³；读数必须大于当期期初读数、且不超过次期期末读数。
        </div>
      </div>
      <div className="field">
        <label>调整原因</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="field">
        <label>抄表回执编号（可留空，由模拟抄表接口生成）</label>
        <input value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="RC-..." />
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>取消</button>
        <button
          className="btn btn-primary"
          disabled={busy || value === '' || !reason.trim()}
          onClick={() =>
            onSubmit({ correctedValue: Number(value), reason: reason.trim(), ...(receipt.trim() ? { receiptNo: receipt.trim() } : {}) })
          }
        >
          确认并生成调整单
        </button>
      </div>
    </Modal>
  );
}

function NoErrorModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState('现场复核读数与原记录一致');
  return (
    <Modal title="完成现场复核：读数无误" subtitle="不生成调整单，原账单金额不变，交住户确认" onClose={onClose} width={480}>
      <div className="field">
        <label>复核说明</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => onSubmit(note)}>
          提交结论
        </button>
      </div>
    </Modal>
  );
}

function ConfirmAgreeModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: () => void }) {
  return (
    <Modal title="确认复核结论" subtitle="确认后客服方可关闭本申请" onClose={onClose} width={440}>
      <p className="small">请核对原账单金额、调整原因与补退明细。确认无误后，本申请方可由客服关闭。</p>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>再看看</button>
        <button className="btn btn-primary" disabled={busy} onClick={onSubmit}>
          我确认无误
        </button>
      </div>
    </Modal>
  );
}

function DisagreeModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Modal title="对结论仍有异议" subtitle="申请将保持打开，客服需重新安排现场复核，不会被自动关闭" onClose={onClose} width={480}>
      <div className="field">
        <label>仍有异议的原因（必填）</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="请说明不认可的具体原因" />
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn btn-danger" disabled={busy || !note.trim()} onClick={() => onSubmit(note.trim())}>
          提交异议
        </button>
      </div>
    </Modal>
  );
}
