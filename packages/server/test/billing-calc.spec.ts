import { BillingCalcService, BillSpan } from '../src/billing/billing-calc.service';

describe('BillingCalcService —— 跨期差额计算', () => {
  const calc = new BillingCalcService();

  // 8 月账期：期初 160，原期末 210（估抄），单价 260 分
  const disputed: BillSpan = {
    billId: 10,
    periodKey: '2026-08',
    unitPrice: 260,
    startValue: 160,
    endValue: 210,
    usage: 50,
  };
  // 9 月账期：期初即 8 月期末 210，期末 235，单价 260 分
  const next: BillSpan = {
    billId: 11,
    periodKey: '2026-09',
    unitPrice: 260,
    startValue: 210,
    endValue: 235,
    usage: 25,
  };

  it('估抄偏高：当期退款、次期补收，金额分别计算', () => {
    // 现场实抄 8 月期末为 190：δ = -20
    const lines = calc.computeCrossPeriodDelta(disputed, next, 190);

    expect(lines).toHaveLength(2);

    const [periodLine, nextLine] = lines;
    expect(periodLine.periodKey).toBe('2026-08');
    expect(periodLine.deltaUsage).toBe(-20);
    expect(periodLine.deltaAmount).toBe(-5200); // -20 × 2.60 元 = 退款 52.00 元
    expect(periodLine.kind).toBe('REFUND');

    expect(nextLine.periodKey).toBe('2026-09');
    expect(nextLine.deltaUsage).toBe(20);
    expect(nextLine.deltaAmount).toBe(5200); // +20 × 2.60 元 = 补收 52.00 元
    expect(nextLine.kind).toBe('SURCHARGE');

    // 总量守恒：修正只在账期间平移用量，合计差为 0
    expect(periodLine.deltaAmount + nextLine.deltaAmount).toBe(0);
    expect(periodLine.deltaUsage + nextLine.deltaUsage).toBe(0);
  });

  it('估抄偏低：当期补收、次期退款', () => {
    // δ = +15
    const lines = calc.computeCrossPeriodDelta(disputed, next, 225);
    expect(lines[0]).toMatchObject({ periodKey: '2026-08', deltaUsage: 15, deltaAmount: 3900, kind: 'SURCHARGE' });
    expect(lines[1]).toMatchObject({ periodKey: '2026-09', deltaUsage: -15, deltaAmount: -3900, kind: 'REFUND' });
  });

  it('次期单价不同：两期按各自单价分别计价', () => {
    const nextDifferentPrice = { ...next, unitPrice: 300 };
    const lines = calc.computeCrossPeriodDelta(disputed, nextDifferentPrice, 190);
    expect(lines[0].deltaAmount).toBe(-5200); // 8 月 2.60
    expect(lines[1].deltaAmount).toBe(6000); // 9 月 3.00：净额补收 800 分
  });

  it('没有次期账单（最新账期）：差额全部留在当期，只产生一条流水行', () => {
    const lines = calc.computeCrossPeriodDelta(disputed, null, 190);
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe('REFUND');
    expect(lines[0].deltaAmount).toBe(-5200);
  });

  it('读数一致不产生调整行', () => {
    expect(calc.computeCrossPeriodDelta(disputed, next, 210)).toEqual([]);
  });

  it('单调性校验：不得低于期初读数、不得高于次期期末读数', () => {
    expect(calc.validateMonotonic(disputed, next, 150)).toContain('不能倒退');
    expect(calc.validateMonotonic(disputed, next, 240)).toContain('矛盾');
    expect(calc.validateMonotonic(disputed, next, 190)).toBeNull();
    expect(calc.validateMonotonic(disputed, null, 500)).toBeNull(); // 无次期账单时只约束下界
  });
});
