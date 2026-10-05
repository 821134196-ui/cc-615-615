import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService) {}

  /** 住户仅可读取本人流水；客服可按住户查询 */
  async list(user: { id: number; role: string }, residentId?: number) {
    const targetId = user.role === 'AGENT' && residentId ? Number(residentId) : user.id;
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { residentId: targetId },
      include: { bill: { include: { meter: true } } },
      orderBy: { id: 'desc' },
    });
    return entries.map((e) => ({
      id: e.id,
      periodKey: e.periodKey,
      type: e.type,
      amount: e.amount,
      createdAt: e.createdAt,
      idempotencyKey: e.idempotencyKey,
      bill: e.bill
        ? { id: e.bill.id, meterNo: e.bill.meter.meterNo, periodKey: e.bill.periodKey }
        : null,
    }));
  }
}
