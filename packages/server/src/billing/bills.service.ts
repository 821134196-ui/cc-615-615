import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class BillsService {
  constructor(private prisma: PrismaService) {}

  /** 住户可见的账单：仅自己的表；客服可看全部 */
  async list(opts: { userId: number; role: string; residentId?: number }) {
    const bills = await this.prisma.bill.findMany({
      where: opts.role === 'AGENT' && opts.residentId ? { meter: { userId: opts.residentId } } : undefined,
      include: { meter: true },
      orderBy: [{ meterId: 'asc' }, { periodKey: 'desc' }],
    });
    const visible = opts.role === 'AGENT' ? bills : bills.filter((b) => b.meter.userId === opts.userId);
    return visible.map((b) => ({
      id: b.id,
      periodKey: b.periodKey,
      version: b.version,
      usage: b.usage,
      unitPrice: b.unitPrice,
      amount: b.amount,
      status: b.status,
      meter: { id: b.meter.id, meterNo: b.meter.meterNo, address: b.meter.address },
    }));
  }

  /** 取账单并做归属校验；越权一律 404，不泄露资源是否存在 */
  async getOwnedBill(billId: number, userId: number, role: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: { meter: true },
    });
    if (!bill || (role !== 'AGENT' && bill.meter.userId !== userId)) {
      throw new NotFoundException('账单不存在');
    }
    return bill;
  }

  /** 账单详情：快照 + 起止读数 + 调整行 */
  async detail(billId: number, userId: number, role: string) {
    const bill = await this.getOwnedBill(billId, userId, role);
    const [startReading, endReading, adjustmentLines] = await Promise.all([
      this.prisma.meterReading.findUnique({ where: { id: bill.startReadingId }, include: { photo: true } }),
      this.prisma.meterReading.findUnique({ where: { id: bill.endReadingId }, include: { photo: true } }),
      this.prisma.adjustmentLine.findMany({
        where: { billId },
        include: { ledgerEntry: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    return {
      id: bill.id,
      periodKey: bill.periodKey,
      version: bill.version,
      usage: bill.usage,
      unitPrice: bill.unitPrice,
      amount: bill.amount,
      status: bill.status,
      createdAt: bill.createdAt,
      meter: { id: bill.meter.id, meterNo: bill.meter.meterNo, address: bill.meter.address, userId: bill.meter.userId },
      startReading: serializeReading(startReading),
      endReading: serializeReading(endReading),
      adjustmentLines: adjustmentLines.map((l) => ({
        id: l.id,
        adjustmentId: l.adjustmentId,
        periodKey: l.periodKey,
        kind: l.kind,
        deltaUsage: l.deltaUsage,
        deltaAmount: l.deltaAmount,
        ledgerEntry: l.ledgerEntry
          ? { id: l.ledgerEntry.id, type: l.ledgerEntry.type, amount: l.ledgerEntry.amount, createdAt: l.ledgerEntry.createdAt }
          : null,
      })),
    };
  }

  /** 读数曲线：该表全部账期读数，标明估抄/实抄、例行/复核 */
  async readingCurve(meterId: number, userId: number, role: string) {
    const meter = await this.prisma.meter.findUnique({ where: { id: meterId } });
    if (!meter || (role !== 'AGENT' && meter.userId !== userId)) {
      throw new NotFoundException('表计不存在');
    }
    const readings = await this.prisma.meterReading.findMany({
      where: { meterId },
      include: { photo: true },
      orderBy: [{ periodKey: 'asc' }, { source: 'asc' }],
    });
    return readings.map(serializeReading);
  }
}

function serializeReading(r: any) {
  if (!r) return null;
  return {
    id: r.id,
    meterId: r.meterId,
    periodKey: r.periodKey,
    value: r.value,
    readingType: r.readingType,
    source: r.source,
    receiptNo: r.receiptNo ?? null,
    readAt: r.readAt,
    createdAt: r.createdAt,
    photo: r.photo
      ? { id: r.photo.id, originalFilename: r.photo.originalFilename, contentType: r.photo.contentType, sha256: r.photo.sha256 }
      : null,
  };
}
