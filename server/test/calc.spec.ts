import {
  BillSnapshot,
  computeAdjustmentLines,
  ReadingPoint,
  validateCorrections,
} from '../src/adjustments/calc';

const PRICE = 3.2;

function reading(id: string, date: string, value: number, kind = 'ACTUAL'): ReadingPoint {
  return { id, date: new Date(date), value, kind };
}

function bill(
  id: string,
  period: string,
  startReadingId: string,
  endReadingId: string,
  startValue: number,
  endValue: number,
): BillSnapshot {
  const usage = endValue - startValue;
  return {
    id,
    period,
    startReadingId,
    endReadingId,
    startValue,
    endValue,
    usage,
    unitPrice: PRICE,
    amount: Math.round(usage * PRICE * 100) / 100,
  };
}

/**
 * 场景：5 月末实抄 1210，6、7 月估抄偏低（1240 / 1270），8 月末实抄 1358。
 * 复核确认 6 月底真实 1252、7 月底真实 1296。
 */
const readings: ReadingPoint[] = [
  reading('r5', '2026-05-31', 1210),
  reading('r6', '2026-06-30', 1240, 'ESTIMATED'),
  reading('r7', '2026-07-31', 1270, 'ESTIMATED'),
  reading('r8', '2026-08-31', 1358),
];
const bills: BillSnapshot[] = [
  bill('b6', '2026-06', 'r5', 'r6', 1210, 1240), // 30 m³ → 96
  bill('b7', '2026-07', 'r6', 'r7', 1240, 1270), // 30 m³ → 96
  bill('b8', '2026-08', 'r7', 'r8', 1270, 1358), // 88 m³ → 281.6
];

describe('跨期差额计算', () => {
  it('更正一条估抄读数会同时影响相邻两个账期（一补一退）', () => {
    const lines = computeAdjustmentLines(bills, [{ readingId: 'r6', value: 1252 }]);
    expect(lines).toHaveLength(2);
    const l6 = lines.find((l) => l.period === '2026-06')!;
    const l7 = lines.find((l) => l.period === '2026-07')!;
    // 6 月：1210→1252 = 42 m³ → 134.4，补收 38.4
    expect(l6.prevUsage).toBe(30);
    expect(l6.newUsage).toBe(42);
    expect(l6.newAmount).toBeCloseTo(134.4);
    expect(l6.delta).toBeCloseTo(38.4);
    // 7 月：1252→1270 = 18 m³ → 57.6，退款 38.4
    expect(l7.newUsage).toBe(18);
    expect(l7.newAmount).toBeCloseTo(57.6);
    expect(l7.delta).toBeCloseTo(-38.4);
    // 8 月不受影响
    expect(lines.find((l) => l.period === '2026-08')).toBeUndefined();
  });

  it('连续更正两条估抄读数影响三个账期，且跨期重分配合计可以为零', () => {
    const lines = computeAdjustmentLines(bills, [
      { readingId: 'r6', value: 1252 },
      { readingId: 'r7', value: 1296 },
    ]);
    expect(lines).toHaveLength(3);
    const byPeriod = Object.fromEntries(lines.map((l) => [l.period, l]));
    expect(byPeriod['2026-06'].newUsage).toBe(42); // 1210→1252
    expect(byPeriod['2026-06'].delta).toBeCloseTo(38.4);
    expect(byPeriod['2026-07'].newUsage).toBe(44); // 1252→1296
    expect(byPeriod['2026-07'].delta).toBeCloseTo(44.8);
    expect(byPeriod['2026-08'].newUsage).toBe(62); // 1296→1358
    expect(byPeriod['2026-08'].delta).toBeCloseTo(-83.2);
    const total = lines.reduce((s, l) => s + l.delta, 0);
    expect(total).toBeCloseTo(0); // 总量守恒：只是跨期重分配
  });

  it('未更正的账单不产生调整行', () => {
    const lines = computeAdjustmentLines(bills, [{ readingId: 'r6', value: 1240 }]);
    expect(lines).toHaveLength(0);
  });

  it('校验：只能更正估抄读数', () => {
    expect(() => validateCorrections(readings, [{ readingId: 'r5', value: 1215 }])).toThrow(
      /估抄/,
    );
  });

  it('校验：读数序列必须单调不减', () => {
    expect(() => validateCorrections(readings, [{ readingId: 'r6', value: 1200 }])).toThrow(
      /单调不减/,
    );
    expect(() => validateCorrections(readings, [{ readingId: 'r7', value: 1400 }])).toThrow(
      /单调不减/,
    );
  });

  it('校验：已被更正过的估抄不能再次更正', () => {
    const withSuperseded = readings.map((r) =>
      r.id === 'r6' ? { ...r, supersededById: 'rx' } : r,
    );
    expect(() =>
      validateCorrections(withSuperseded, [{ readingId: 'r6', value: 1252 }]),
    ).toThrow(/已被/);
  });

  it('校验：拒绝负用量与非法数值', () => {
    expect(() => validateCorrections(readings, [{ readingId: 'r6', value: -1 }])).toThrow();
    expect(() => validateCorrections(readings, [{ readingId: 'r6', value: 1.5 }])).toThrow();
    expect(() =>
      computeAdjustmentLines(
        [bill('bx', '2026-06', 'r5', 'r6', 1210, 1240)],
        [{ readingId: 'r6', value: 1200 }],
      ),
    ).toThrow(/负/);
  });

  it('校验：同次复核不能重复更正同一条读数', () => {
    expect(() =>
      validateCorrections(readings, [
        { readingId: 'r6', value: 1250 },
        { readingId: 'r6', value: 1252 },
      ]),
    ).toThrow(/重复/);
  });
});
