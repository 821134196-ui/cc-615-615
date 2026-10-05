export type Role = 'RESIDENT' | 'AGENT';

export interface UserInfo {
  id: number;
  username: string;
  role: Role;
  displayName: string;
}

export interface MeterInfo {
  id: number;
  meterNo: string;
  address: string;
  userId?: number;
}

export interface ReadingPhoto {
  id: number;
  originalFilename: string;
  contentType: string;
  sha256?: string;
}

export interface MeterReading {
  id: number;
  meterId: number;
  periodKey: string;
  value: number;
  readingType: 'ESTIMATED' | 'ACTUAL';
  source: 'ROUTINE' | 'ONSITE';
  receiptNo: string | null;
  readAt: string;
  photo: ReadingPhoto | null;
}

export interface AdjustmentLine {
  id: number;
  adjustmentId: number;
  billId: number;
  periodKey: string;
  kind: 'SURCHARGE' | 'REFUND';
  deltaUsage: number;
  deltaAmount: number;
  ledgerEntry: { id: number; type: string; amount: number } | null;
}

export interface Bill {
  id: number;
  periodKey: string;
  version: number;
  usage: number;
  unitPrice: number;
  amount: number;
  status: 'ORIGINAL' | 'ADJUSTED';
  meter: MeterInfo;
}

export interface BillDetail extends Bill {
  createdAt: string;
  startReading: MeterReading | null;
  endReading: MeterReading | null;
  adjustmentLines: AdjustmentLine[];
}

export interface FieldReviewView {
  id: number;
  scheduledAt: string;
  completedAt: string | null;
  result: 'NO_ERROR' | 'ERROR_FOUND' | null;
  note: string | null;
  receiptNo: string | null;
  correctedReading: {
    id: number;
    value: number;
    readingType: string;
    source: string;
    readAt: string;
    photo: { id: number; originalFilename: string } | null;
  } | null;
}

export interface AdjustmentView {
  id: number;
  receiptNo: string;
  reason: string;
  status: string;
  totalDelta: number;
  appliedAt: string;
  lines: AdjustmentLine[];
}

export interface Dispute {
  id: number;
  status:
    | 'SUBMITTED'
    | 'SCHEDULED'
    | 'REVIEWED'
    | 'DISPUTED_AGAIN'
    | 'RESOLVED'
    | 'CLOSED';
  reason: string;
  residentNote: string | null;
  residentDecidedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  resident: { id: number; username: string; displayName: string };
  bill: {
    id: number;
    periodKey: string;
    version: number;
    usage: number;
    unitPrice: number;
    amount: number;
    status: string;
    meter: MeterInfo;
  };
  reviews: FieldReviewView[];
  adjustment: AdjustmentView | null;
}

export interface LedgerEntry {
  id: number;
  periodKey: string;
  type: 'CHARGE' | 'SURCHARGE' | 'REFUND';
  amount: number;
  createdAt: string;
  idempotencyKey: string;
  bill: { id: number; meterNo: string; periodKey: string } | null;
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}
