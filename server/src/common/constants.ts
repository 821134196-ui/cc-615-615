export const ROLES = { RESIDENT: 'RESIDENT', AGENT: 'AGENT' } as const;
export type Role = keyof typeof ROLES;

/** 异议状态机：只有住户显式接受结论才能进入 CLOSED，系统不自动关闭 */
export const DISPUTE_STATUS = {
  SUBMITTED: 'SUBMITTED', // 已提交，待客服受理
  REVIEW_SCHEDULED: 'REVIEW_SCHEDULED', // 已安排现场复核
  CONCLUSION_REACHED: 'CONCLUSION_REACHED', // 复核结论已出（已调整或确认无误），待住户确认
  CLOSED: 'CLOSED', // 住户已接受结论，关闭
} as const;
export type DisputeStatus = keyof typeof DISPUTE_STATUS;

export const READING_KIND = { ACTUAL: 'ACTUAL', ESTIMATED: 'ESTIMATED' } as const;

export const LEDGER_TYPE = { SURCHARGE: 'SURCHARGE', REFUND: 'REFUND' } as const;

export interface AuthUser {
  userId: string;
  name: string;
  role: Role;
  residentId: string | null;
}
