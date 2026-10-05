export interface UserInfo {
  userId: string;
  username: string;
  name: string;
  role: 'RESIDENT' | 'AGENT';
  residentId: string | null;
  accountNo: string | null;
  address: string | null;
}

export interface Bill {
  id: string;
  period: string;
  startValue: number;
  endValue: number;
  usage: number;
  unitPrice: number;
  amount: number;
  status: string;
  meterId: string;
  residentId: string;
  meter?: { meterNo: string };
  resident?: { accountNo: string; address?: string; user: { name: string } };
  openDispute?: { id: string; status: string } | null;
}

export interface ReadingPoint {
  id: string;
  date: string;
  value: number;
  kind: 'ACTUAL' | 'ESTIMATED';
  source: string;
  supersedesId: string | null;
  supersededById: string | null;
  hasPhoto: boolean;
  photoUrl: string | null;
}

export interface LedgerEntry {
  id: string;
  period: string;
  type: 'SURCHARGE' | 'REFUND';
  amount: number;
  createdAt: string;
  billId: string;
  adjustmentLine?: { adjustment: { reason: string; receiptNo: string } };
}

export interface AdjustmentLine {
  id: string;
  period: string;
  prevUsage: number;
  newUsage: number;
  prevAmount: number;
  newAmount: number;
  delta: number;
  ledgerEntry?: LedgerEntry | null;
}

export interface Adjustment {
  id: string;
  receiptNo: string;
  reason: string;
  totalDelta: number;
  createdAt: string;
  lines: AdjustmentLine[];
}

export interface DisputeEvent {
  id: string;
  actorName: string;
  action: string;
  note: string | null;
  createdAt: string;
}

export interface Dispute {
  id: string;
  billId: string;
  reason: string;
  status: string;
  createdAt: string;
  bill: Bill;
  events: DisputeEvent[];
  reviewTask: {
    scheduledAt: string | null;
    assigneeName: string | null;
    completedAt: string | null;
  } | null;
  adjustments: Adjustment[];
}

export interface DisputeListItem {
  id: string;
  reason: string;
  status: string;
  createdAt: string;
  bill: { period: string; amount: number; usage: number };
  resident: { accountNo: string; address: string; user: { name: string } };
}

export interface Receipt {
  id: string;
  receiptNo: string;
  meterId: string;
  value: number;
  takenAt: string;
  photoToken: string;
  consumedByAdjustmentId: string | null;
}

export interface AppNotification {
  id: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export const DISPUTE_STATUS_TEXT: Record<string, string> = {
  SUBMITTED: '已提交',
  REVIEW_SCHEDULED: '复核中',
  CONCLUSION_REACHED: '结论待确认',
  CLOSED: '已关闭',
};

export const DISPUTE_STATUS_BADGE: Record<string, string> = {
  SUBMITTED: 'amber',
  REVIEW_SCHEDULED: 'blue',
  CONCLUSION_REACHED: 'green',
  CLOSED: 'gray',
};

export const EVENT_TEXT: Record<string, string> = {
  SUBMIT: '提交异议',
  SCHEDULE: '安排现场复核',
  ISSUE_ADJUSTMENT: '生成调整单',
  NO_ERROR: '复核结论：读数无误',
  RESIDENT_ACCEPT: '住户确认结案',
  RESIDENT_REJECT: '住户提出再异议',
};

export function fmtMoney(n: number) {
  return `¥${n.toFixed(2)}`;
}

export function fmtDelta(n: number) {
  return n > 0 ? `+${fmtMoney(n)}` : n < 0 ? `-${fmtMoney(-n)}` : fmtMoney(0);
}

export function fmtTime(s: string | null | undefined) {
  if (!s) return '—';
  return new Date(s).toLocaleString('zh-CN', { hour12: false });
}
