/** 分 -> 元，两位小数 */
export function yuan(fen: number): string {
  return (fen / 100).toFixed(2);
}

/** 有符号金额：+52.00 / -52.00 */
export function signedYuan(fen: number): string {
  const v = (Math.abs(fen) / 100).toFixed(2);
  return fen > 0 ? `+${v}` : fen < 0 ? `-${v}` : v;
}

export function periodLabel(p: string): string {
  return `${p.slice(0, 4)} 年 ${Number(p.slice(5, 7))} 月账期`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
}

export const DISPUTE_STATUS_LABEL: Record<string, string> = {
  SUBMITTED: '待安排复核',
  SCHEDULED: '已安排现场复核',
  REVIEWED: '复核完成，待住户确认',
  DISPUTED_AGAIN: '住户仍有异议',
  RESOLVED: '住户已确认结论',
  CLOSED: '已关闭',
};

export const READING_TYPE_LABEL: Record<string, string> = {
  ESTIMATED: '估抄',
  ACTUAL: '实抄',
};

export const LEDGER_TYPE_LABEL: Record<string, string> = {
  CHARGE: '原账单扣费',
  SURCHARGE: '跨期补收',
  REFUND: '退款',
};

export function statusTone(status: string): string {
  switch (status) {
    case 'CLOSED':
      return 'tone-muted';
    case 'RESOLVED':
      return 'tone-good';
    case 'DISPUTED_AGAIN':
      return 'tone-critical';
    case 'REVIEWED':
      return 'tone-warning';
    default:
      return 'tone-info';
  }
}
