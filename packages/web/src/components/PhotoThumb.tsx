import { useState } from 'react';
import { authedPhotoUrl } from '../api';
import { Modal } from './Modal';

/** 抄表照片缩略图：带鉴权加载，点击放大；原始照片保留可查 */
export function PhotoThumb({ photoId, caption }: { photoId: number; caption?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [err, setErr] = useState(false);

  const load = async () => {
    try {
      const u = await authedPhotoUrl(photoId);
      setUrl(u);
    } catch {
      setErr(true);
    }
  };

  return (
    <>
      <div
        className="photo-thumb"
        onMouseEnter={() => !url && !err && load()}
        onClick={() => url && setZoom(true)}
        title="点击查看原始抄表照片"
      >
        {err ? (
          <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            照片无法加载
          </div>
        ) : url ? (
          <img src={url} alt={caption ?? '抄表照片'} />
        ) : (
          <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            悬停加载照片…
          </div>
        )}
        <div className="cap">{caption ?? '原始抄表照片'}</div>
      </div>
      {zoom && url && (
        <Modal title="原始抄表照片" subtitle={caption} onClose={() => setZoom(false)} width={560}>
          <img src={url} alt={caption ?? '抄表照片'} style={{ width: '100%', borderRadius: 8 }} />
        </Modal>
      )}
    </>
  );
}
