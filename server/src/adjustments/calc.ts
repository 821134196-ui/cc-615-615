/**
 * 跨期差额计算（纯函数，便于单测）。
 *
 * 背景：某账期期末读数若为估抄，复核确认真实读数后，该读数同时是
 * 上一账期的"期末"与下一账期的"期初"，因此一次更正会影响相邻两个
 * （甚至更多，连续估抄时）账期的用量与金额。每个受影响账期产生一条
 * 调整明细，正差额记补收、负差额记退款，分别入账。
 */

export interface ReadingPoint {
  id: string;
  date: Date;
  value: number;
  kind: string; // ACTUAL | ESTIMATED
  supersededById?: string | null;
}

export interface BillSnapshot {
  id: string;
  period: string;
  startReadingId: string;
  endReadingId: string;
  startValue: number;
  endValue: number;
  usage: number;
  unitPrice: number;
  amount: number;
}

export interface Correction {
  readingId: string;
  value: number;
}

export interface AdjustmentLineCalc {
  billId: string;
  period: string;
  prevUsage: number;
  newUsage: number;
  prevAmount: number;
  newAmount: number;
  delta: number; // newAmount - prevAmount
}

export class CalcError extends Error {}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 校验更正读数：
 * 1. 目标读数必须存在且为估抄、且尚未被更正过；
 * 2. 更正后整表读数序列（按时间）必须保持单调不减（燃气表累计读数物理约束）。
 */
export function validateCorrections(readings: ReadingPoint[], corrections: Correction[]): void {
  if (corrections.length === 0) {
    throw new CalcError('至少需要一条更正读数');
  }
  const byId = new Map(readings.map((r) => [r.id, r]));
  const seen = new Set<string>();
  for (const c of corrections) {
    if (!Number.isInteger(c.value) || c.value < 0) {
      throw new CalcError(`更正读数必须为非负整数，收到 ${c.value}`);
    }
    if (seen.has(c.readingId)) {
      throw new CalcError('同一次复核中不能重复更正同一条读数');
    }
    seen.add(c.readingId);
    const target = byId.get(c.readingId);
    if (!target) {
      throw new CalcError(`读数 ${c.readingId} 不存在`);
    }
    if (target.kind !== 'ESTIMATED') {
      throw new CalcError('只有估抄读数可以被复核更正');
    }
    if (target.supersededById) {
      throw new CalcError('该估抄读数已被更早的复核更正过，不能重复更正');
    }
  }

  // 应用更正后的有效序列必须单调不减
  const corrected = new Map(corrections.map((c) => [c.readingId, c.value]));
  const effective = readings
    .filter((r) => !r.supersededById) // 已被取代的旧读数不参与序列
    .map((r) => ({ date: r.date, value: corrected.get(r.id) ?? r.value }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  for (let i = 1; i < effective.length; i++) {
    if (effective[i].value < effective[i - 1].value) {
      throw new CalcError(
        '更正后的读数序列出现倒退（燃气表累计读数必须单调不减），请核对更正数值',
      );
    }
  }
}

/**
 * 计算跨期调整明细：对每只受影响的账单，用更正后的起止读数重算用量与金额。
 * 返回差额非零的明细行；若全部无差额返回空数组。
 */
export function computeAdjustmentLines(
  bills: BillSnapshot[],
  corrections: Correction[],
): AdjustmentLineCalc[] {
  const corrected = new Map(corrections.map((c) => [c.readingId, c.value]));
  const lines: AdjustmentLineCalc[] = [];
  for (const bill of bills) {
    const newStart = corrected.get(bill.startReadingId) ?? bill.startValue;
    const newEnd = corrected.get(bill.endReadingId) ?? bill.endValue;
    const newUsage = newEnd - newStart;
    if (newUsage < 0) {
      throw new CalcError(`账期 ${bill.period} 更正后用量为负，更正数值不合理`);
    }
    const newAmount = round2(newUsage * bill.unitPrice);
    const delta = round2(newAmount - bill.amount);
    if (delta !== 0) {
      lines.push({
        billId: bill.id,
        period: bill.period,
        prevUsage: bill.usage,
        newUsage,
        prevAmount: bill.amount,
        newAmount,
        delta,
      });
    }
  }
  return lines;
}
