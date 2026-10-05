import { useEffect, useState } from 'react';
import { api } from '../api';
import { NotificationItem } from '../types';

export function NotificationsPage({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<NotificationItem[]>([]);

  const load = () => api<NotificationItem[]>('GET', '/notifications').then(setItems);

  useEffect(() => {
    load();
  }, [refreshKey]);

  const markRead = async (id: number) => {
    await api('PATCH', `/notifications/${id}/read`);
    load();
  };

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <h2>通知</h2>
        <span className="desc">复核安排、调整结果、申请关闭等站内消息（本地模拟通知接口）</span>
      </div>
      <div className="card" style={{ padding: 0 }}>
        {items.length === 0 ? (
          <div className="muted" style={{ padding: 18 }}>暂无通知。</div>
        ) : (
          items.map((n, i) => (
            <div
              key={n.id}
              style={{
                padding: '13px 18px',
                borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--gridline)',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                background: n.readAt ? 'transparent' : 'var(--page)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: n.readAt ? 500 : 700, fontSize: 14 }}>
                  {!n.readAt && <span style={{ color: 'var(--surcharge)', marginRight: 6 }}>●</span>}
                  {n.title}
                </div>
                <div className="muted small" style={{ marginTop: 3 }}>{n.body}</div>
                <div className="muted small" style={{ marginTop: 3 }}>
                  {new Date(n.createdAt).toLocaleString('zh-CN', { hour12: false })}
                </div>
              </div>
              {!n.readAt && (
                <button className="btn btn-sm" onClick={() => markRead(n.id)}>
                  标为已读
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
