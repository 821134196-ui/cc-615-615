// 枚举取值（SQLite 下以字符串存储）
export const Role = {
  RESIDENT: 'RESIDENT',
  AGENT: 'AGENT',
} as const;

export const ReadingType = {
  ESTIMATED: 'ESTIMATED', // 估抄
  ACTUAL: 'ACTUAL', // 实抄
} as const;

export const ReadingSource = {
  ROUTINE: 'ROUTINE', // 例行抄表
  ONSITE: 'ONSITE', // 现场复核
} as const;

export const BillStatus = {
  ORIGINAL: 'ORIGINAL', // 原账单（快照保留）
  ADJUSTED: 'ADJUSTED', // 已有调整单触及
} as const;

export const DisputeStatus = {
  SUBMITTED: 'SUBMITTED', // 已提交
  SCHEDULED: 'SCHEDULED', // 已安排现场复核
  REVIEWED: 'REVIEWED', // 复核完成，待住户确认
  DISPUTED_AGAIN: 'DISPUTED_AGAIN', // 住户对结论仍有异议（不得关闭）
  RESOLVED: 'RESOLVED', // 住户确认结论
  CLOSED: 'CLOSED', // 已关闭
} as const;

export const ReviewResult = {
  NO_ERROR: 'NO_ERROR', // 读数无误
  ERROR_FOUND: 'ERROR_FOUND', // 读数有误
} as const;

export const AdjustmentStatus = {
  PROPOSED: 'PROPOSED',
  APPLIED: 'APPLIED',
  REJECTED: 'REJECTED',
} as const;

export const AdjustmentKind = {
  SURCHARGE: 'SURCHARGE', // 补收
  REFUND: 'REFUND', // 退款
} as const;

export const LedgerType = {
  CHARGE: 'CHARGE', // 原账单扣费
  SURCHARGE: 'SURCHARGE', // 跨期补收
  REFUND: 'REFUND', // 退款
} as const;

export const NotificationType = {
  DISPUTE_RECEIVED: 'DISPUTE_RECEIVED',
  REVIEW_SCHEDULED: 'REVIEW_SCHEDULED',
  REVIEW_DONE: 'REVIEW_DONE',
  ADJUSTMENT_APPLIED: 'ADJUSTMENT_APPLIED',
  DISPUTE_CLOSED: 'DISPUTE_CLOSED',
} as const;

/** 分 -> 元（展示用） */
export function fenToYuan(fen: number): string {
  return (fen / 100).toFixed(2);
}
