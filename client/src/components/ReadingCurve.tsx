import { ReadingPoint } from '../types';

interface Props {
  readings: ReadingPoint[];
  startReadingId?: string;
  endReadingId?: string;
}

const KIND_LABEL: Record<string, string> = {
  ACTUAL: '实抄',
  ESTIMATED: '估抄',
};

/**
 * 读数曲线：实抄实心蓝点、估抄空心橙点、复核更正绿点；
 * 被更正取代的原始估抄读数以灰色空心点保留在图上，并用虚线连向更正值。
 */
export default function ReadingCurve({ readings, startReadingId, endReadingId }: Props) {
  const W = 760;
  const H = 280;
  const PAD = { l: 56, r: 20, t: 24, b: 44 };

  const effective = readings.filter((r) => !r.supersededById);
  const superseded = readings.filter((r) => r.supersededById);
  if (effective.length === 0) return <p className="muted">暂无读数</p>;

  const dates = Array.from(new Set(effective.map((r) => r.date.slice(0, 10)))).sort();
  const xOf = (date: string) => {
    const i = dates.indexOf(date.slice(0, 10));
    return PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(dates.length - 1, 1);
  };
  const allValues = readings.map((r) => r.value);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = Math.max(max - min, 1);
  const yOf = (v: number) =>
    PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);

  const sorted = [...effective].sort((a, b) => a.date.localeCompare(b.date));
  const path = sorted.map((r, i) => `${i === 0 ? 'M' : 'L'}${xOf(r.date)},${yOf(r.value)}`).join(' ');

  const startPt = sorted.find((r) => r.id === startReadingId);
  const endPt = sorted.find((r) => r.id === endReadingId);

  const correctedById = new Map(readings.map((r) => [r.id, r]));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        {/* 网格线 */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = PAD.t + t * (H - PAD.t - PAD.b);
          const v = Math.round(max - t * span);
          return (
            <g key={t}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#eef1f5" />
              <text x={PAD.l - 8} y={y + 4} fontSize="11" fill="#9aa3b2" textAnchor="end">
                {v}
              </text>
            </g>
          );
        })}

        {/* 账单区间高亮 */}
        {startPt && endPt && (
          <rect
            x={xOf(startPt.date)}
            y={PAD.t}
            width={Math.max(xOf(endPt.date) - xOf(startPt.date), 2)}
            height={H - PAD.t - PAD.b}
            fill="#1f6feb10"
            stroke="#1f6feb30"
            strokeDasharray="4 3"
          />
        )}

        {/* 被取代的原始估抄 → 更正值 的虚线 */}
        {superseded.map((r) => {
          const corrected = correctedById.get(r.supersededById!);
          if (!corrected) return null;
          return (
            <line
              key={`corr-${r.id}`}
              x1={xOf(r.date)}
              y1={yOf(r.value)}
              x2={xOf(corrected.date)}
              y2={yOf(corrected.value)}
              stroke="#9aa3b2"
              strokeDasharray="3 3"
            />
          );
        })}

        {/* 主曲线 */}
        <path d={path} fill="none" stroke="#1f6feb" strokeWidth="2" />

        {/* 有效读数点 */}
        {sorted.map((r) => {
          const x = xOf(r.date);
          const y = yOf(r.value);
          const isEstimated = r.kind === 'ESTIMATED';
          const isReview = r.source === 'REVIEW';
          const isBoundary = r.id === startReadingId || r.id === endReadingId;
          const label = `${r.date.slice(0, 10)}　${r.value} m³　${isReview ? '复核更正' : KIND_LABEL[r.kind]}`;
          return (
            <g key={r.id}>
              {isBoundary && <circle cx={x} cy={y} r="10" fill="none" stroke="#1f6feb" strokeWidth="1.5" />}
              {isEstimated ? (
                <circle cx={x} cy={y} r="5.5" fill="#fff" stroke="#d97706" strokeWidth="2.5" strokeDasharray="3 2">
                  <title>{label}</title>
                </circle>
              ) : (
                <circle cx={x} cy={y} r="5.5" fill={isReview ? '#059669' : '#1f6feb'}>
                  <title>{label}</title>
                </circle>
              )}
              <text x={x} y={y - 12} fontSize="11" fill={isEstimated ? '#d97706' : isReview ? '#059669' : '#4b5563'} textAnchor="middle">
                {r.value}
              </text>
            </g>
          );
        })}

        {/* 被取代的原始估抄点（保留展示） */}
        {superseded.map((r) => (
          <g key={r.id}>
            <circle cx={xOf(r.date)} cy={yOf(r.value)} r="5" fill="#fff" stroke="#b6bcc8" strokeWidth="2" strokeDasharray="2 2">
              <title>{`${r.date.slice(0, 10)}　${r.value} m³　原估抄（已被复核更正）`}</title>
            </circle>
            <text x={xOf(r.date)} y={yOf(r.value) + 18} fontSize="10" fill="#b6bcc8" textAnchor="middle">
              {r.value}
            </text>
          </g>
        ))}

        {/* X 轴日期 */}
        {dates.map((d, i) =>
          i % Math.ceil(dates.length / 9) === 0 || i === dates.length - 1 ? (
            <text key={d} x={xOf(d)} y={H - PAD.b + 18} fontSize="10" fill="#9aa3b2" textAnchor="middle">
              {d.slice(2)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="curve-legend">
        <span><span className="legend-dot" style={{ background: '#1f6feb' }} />实抄</span>
        <span><span className="legend-dot" style={{ background: '#fff', border: '2px solid #d97706' }} />估抄</span>
        <span><span className="legend-dot" style={{ background: '#059669' }} />复核更正</span>
        <span><span className="legend-dot" style={{ background: '#fff', border: '2px dashed #b6bcc8' }} />原估抄（已更正）</span>
        {startPt && endPt && <span><span className="legend-dot" style={{ background: '#1f6feb20', border: '1px solid #1f6feb60' }} />本账期区间</span>}
      </div>
    </div>
  );
}
