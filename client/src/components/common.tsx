import { useEffect, useState } from 'react';
import { fetchPhotoBlob } from '../api';
import { DISPUTE_STATUS_BADGE, DISPUTE_STATUS_TEXT } from '../types';

export function DisputeStatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${DISPUTE_STATUS_BADGE[status] ?? 'gray'}`}>
      {DISPUTE_STATUS_TEXT[status] ?? status}
    </span>
  );
}

export function BillStatusBadge({ status }: { status: string }) {
  return status === 'PAID' ? (
    <span className="badge gray">已缴费</span>
  ) : (
    <span className="badge blue">待缴费</span>
  );
}

/** 抄表照片（需鉴权加载） */
export function MeterPhoto({ url, caption }: { url: string; caption: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let revoked: string | null = null;
    fetchPhotoBlob(url)
      .then((u) => {
        revoked = u;
        setSrc(u);
      })
      .catch(() => setErr(true));
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [url]);
  if (err) return <span className="muted">照片加载失败</span>;
  if (!src) return <span className="muted">照片加载中…</span>;
  return (
    <figure style={{ margin: 0 }}>
      <img src={src} alt={caption} />
      <figcaption className="muted" style={{ textAlign: 'center', marginTop: 4 }}>{caption}</figcaption>
    </figure>
  );
}
