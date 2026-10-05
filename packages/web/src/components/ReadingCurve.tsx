import { useMemo, useState } from 'react';
import { MeterReading } from '../types';
import { READING_TYPE_LABEL } from '../format';

interface Props {
  readings: MeterReading[];
}

const W = 720;
const H = 300;
const M = { top: 24, right: 20, bottom: 42, left: 52 };

/**
 * 读数曲线：账期 × 表具累计读数。
 * 主折线连接各账期“例行抄表”读数（账单依据）；现场复核实抄点叠加在同一账期，
 * 以颜色（蓝=实查/橙=估抄）+ 形状（现场点带白色描边圆环）双重编码，并有虚线与原估抄点相连。
 */
export function ReadingCurve({ readings }: Props) {
  const [hover, setHover] = useState<{ x: number; y: number; items: MeterReading[]; period: string } | null>(null);

  const periods = useMemo(
    () => Array.from(new Set(readings.map((r) => r.periodKey))).sort(),
    [readings],
  );

  const { points, byPeriod, yTicks, xOf, yOf } = useMemo(() => {
    const values = readings.map((r) => r.value);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const pad = Math.max(4, Math.ceil((maxV - minV || 10) * 0.15));
    const lo = Math.max(0, minV - pad);
    const hi = maxV + pad;

    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;
    const xOf = (i: number) => M.left + (periods.length <= 1 ? plotW / 2 : (i * plotW) / (periods.length - 1));
    const yOf = (v: number) => M.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;

    const byPeriod = new Map<string, MeterReading[]>();
    for (const r of readings) {
      const arr = byPeriod.get(r.periodKey) ?? [];
      arr.push(r);
      byPeriod.set(r.periodKey, arr);
    }

    // 主折线点：每账期例行读数（优先 ACTUAL）
    const points = periods.map((p, i) => {
      const arr = byPeriod.get(p)!;
      const routine =
        arr.find((r) => r.source === 'ROUTINE' && r.readingType === 'ACTUAL') ??
        arr.find((r) => r.source === 'ROUTINE')!;
      return { x: xOf(i), y: yOf(routine.value), reading: routine };
    });

    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const v = Math.round(lo + ((hi - lo) * i) / tickCount);
      return { v, y: yOf(v) };
    });

    return { points, byPeriod, yTicks, xOf, yOf };
  }, [readings, periods]);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mx = (e.clientX - rect.left) * scaleX;
    let best = 0;
    let bestDist = Infinity;
    periods.forEach((_, i) => {
      const d = Math.abs(xOf(i) - mx);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    const period = periods[best];
    setHover({
      x: rect.left + (xOf(best) / scaleX),
      y: rect.top + 12,
      items: byPeriod.get(period) ?? [],
      period,
    });
  };

  const colorOf = (r: MeterReading) => (r.readingType === 'ACTUAL' ? '#2a78d6' : '#eb6834');

  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: '#2a78d6' }} /> 实抄
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: '#eb6834' }} /> 估抄
        </span>
        <span className="legend-item">
          <span
            className="legend-swatch"
            style={{ background: '#2a78d6', boxShadow: '0 0 0 2.5px #fff, 0 0 0 4px #2a78d6' }}
          />{' '}
          现场复核实抄
        </span>
        <span className="muted small">纵轴：表具累计读数（m³）</span>
      </div>

      <svg
        className="chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="读数曲线：各账期表具累计读数，区分估抄与实抄"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* 网格线与纵轴刻度 */}
        {yTicks.map((t) => (
          <g key={t.v}>
            <line x1={M.left} x2={W - M.right} y1={t.y} y2={t.y} stroke="#e1e0d9" strokeWidth={1} />
            <text x={M.left - 8} y={t.y + 4} textAnchor="end" fontSize={11} fill="#898781">
              {t.v}
            </text>
          </g>
        ))}
        {/* 横轴 */}
        <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="#c3c2b7" strokeWidth={1} />
        {periods.map((p, i) => (
          <text key={p} x={xOf(i)} y={H - M.bottom + 20} textAnchor="middle" fontSize={11} fill="#52514e">
            {p.slice(5)}月
          </text>
        ))}

        {/* 分段折线：线段颜色取两端读数类型，估抄段为橙、实抄段为蓝 */}
        {points.map((p, i) => {
          if (i === 0) return null;
          const prev = points[i - 1];
          const estimated =
            p.reading.readingType === 'ESTIMATED' || prev.reading.readingType === 'ESTIMATED';
          return (
            <line
              key={`seg-${i}`}
              x1={prev.x}
              y1={prev.y}
              x2={p.x}
              y2={p.y}
              stroke={estimated ? '#eb6834' : '#2a78d6'}
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })}

        {/* 例行读数点 */}
        {points.map((p) => (
          <circle
            key={`main-${p.reading.id}`}
            cx={p.x}
            cy={p.y}
            r={5}
            fill={colorOf(p.reading)}
            stroke="#fcfcfb"
            strokeWidth={2}
          />
        ))}

        {/* 现场复核实抄点：同账期叠加，白环 + 虚线连原估抄点 */}
        {periods.map((p, i) => {
          const arr = byPeriod.get(p) ?? [];
          const onsite = arr.find((r) => r.source === 'ONSITE');
          const routine = arr.find((r) => r.source === 'ROUTINE');
          if (!onsite) return null;
          const ox = xOf(i);
          const oy = yOf(onsite.value);
          return (
            <g key={`onsite-${onsite.id}`}>
              {routine && routine.value !== onsite.value && (
                <line x1={ox} x2={ox} y1={oy} y2={yOf(routine.value)} stroke="#898781" strokeWidth={1.5} strokeDasharray="4 3" />
              )}
              <circle cx={ox} cy={oy} r={6.5} fill="#2a78d6" stroke="#fcfcfb" strokeWidth={3} />
              <text x={ox + 10} y={oy - 8} fontSize={11} fontWeight={700} fill="#1c5cab">
                现场 {onsite.value}
              </text>
            </g>
          );
        })}

        {/* 悬停十字线 */}
        {hover && (
          <line
            x1={xOf(periods.indexOf(hover.period))}
            x2={xOf(periods.indexOf(hover.period))}
            y1={M.top}
            y2={H - M.bottom}
            stroke="#1f2937"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.35}
          />
        )}
      </svg>

      {hover && (
        <div className="chart-tooltip" style={{ left: Math.min(hover.x, window.innerWidth - 190), top: hover.y }}>
          <div className="tt-title">{hover.period} 账期</div>
          {hover.items.map((r) => (
            <div key={r.id}>
              <span style={{ color: r.readingType === 'ACTUAL' ? '#7dd3fc' : '#fdba74' }}>●</span>{' '}
              {READING_TYPE_LABEL[r.readingType]}
              {r.source === 'ONSITE' ? '（现场复核）' : '（例行抄表）'}：{r.value} m³
              {r.receiptNo ? ` · 回执 ${r.receiptNo}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
