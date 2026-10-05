import { Injectable } from '@nestjs/common';

/** 账期工具：YYYY-MM */
@Injectable()
export class PeriodUtil {
  next(periodKey: string): string {
    return shift(periodKey, 1);
  }

  prev(periodKey: string): string {
    return shift(periodKey, -1);
  }

  compare(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
  }
}

export function shift(periodKey: string, deltaMonths: number): string {
  const [y, m] = periodKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface PeriodReading {
  periodKey: string;
  /** 该账期期末表具累计读数 */
  endValue: number;
  readingType: string; // ESTIMATED | ACTUAL
}

export interface BillSpan {
  periodKey: string;
  billId: number;
  unitPrice: number; // 分/立方米
  startValue: number;
  endValue: number;
  usage: number;
}

export interface DeltaLine {
  billId: number;
  periodKey: string;
  /** 有符号用量差 */
  deltaUsage: number;
  /** 有符号金额差（分）：正=补收，负=退款 */
  deltaAmount: number;
  kind: 'SURCHARGE' | 'REFUND';
}

/**
 * 跨期差额计算（核心规则）：
 * 表具读数为累计值。某账期期末读数被现场实抄修正 δ = 修正值 - 原值后：
 *  - 当期用量变化 +δ；
 *  - 下一个已出账账期的用量变化 -δ（其期初读数被修正，期末读数不变）；
 *  - 其余账期用量不变（累计读数锚点未变）。
 * 因此估抄偏高时：当期退款、次期补收，两条流水分别记账。
 */
@Injectable()
export class BillingCalcService {
  /**
   * @param disputed 被异议账期的账单区间（含原期末读数）
   * @param next     下一个已出账账期的账单区间（可能为空：δ 全部留在当期）
   * @param correctedEndValue 现场复核确认的当期期末累计读数
   */
  computeCrossPeriodDelta(
    disputed: BillSpan,
    next: BillSpan | null,
    correctedEndValue: number,
  ): DeltaLine[] {
    const delta = correctedEndValue - disputed.endValue;

    const lines: DeltaLine[] = [];
    if (delta !== 0) {
      lines.push({
        billId: disputed.billId,
        periodKey: disputed.periodKey,
        deltaUsage: delta,
        deltaAmount: delta * disputed.unitPrice,
        kind: delta > 0 ? 'SURCHARGE' : 'REFUND',
      });
    }

    if (next && delta !== 0) {
      const nextDeltaUsage = -delta;
      lines.push({
        billId: next.billId,
        periodKey: next.periodKey,
        deltaUsage: nextDeltaUsage,
        deltaAmount: nextDeltaUsage * next.unitPrice,
        kind: nextDeltaUsage > 0 ? 'SURCHARGE' : 'REFUND',
      });
    }

    return lines;
  }

  /** 单调性校验：修正读数不得小于当期期初读数，也不得大于次期期末读数 */
  validateMonotonic(span: BillSpan, next: BillSpan | null, correctedEndValue: number) {
    if (!Number.isInteger(correctedEndValue) || correctedEndValue < 0) {
      return '复核读数必须为非负整数（立方米）';
    }
    if (correctedEndValue < span.startValue) {
      return `复核读数 ${correctedEndValue} 小于当期期初读数 ${span.startValue}，表具累计读数不能倒退`;
    }
    if (next && correctedEndValue > next.endValue) {
      return `复核读数 ${correctedEndValue} 大于次期期末读数 ${next.endValue}，与后续抄表记录矛盾`;
    }
    return null;
  }
}
