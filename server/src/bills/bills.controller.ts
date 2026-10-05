import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../common/auth';
import { ROLES } from '../common/constants';
import { PrismaService } from '../prisma.service';

@Controller('bills')
@UseGuards(JwtAuthGuard)
export class BillsController {
  constructor(private readonly prisma: PrismaService) {}

  /** 账单列表：住户只能看到自己的；客服看全部 */
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const where = user.role === ROLES.AGENT ? {} : { residentId: user.residentId! };
    const bills = await this.prisma.bill.findMany({
      where,
      orderBy: { period: 'desc' },
      include: {
        meter: { select: { meterNo: true } },
        resident: {
          select: { accountNo: true, user: { select: { name: true } } },
        },
        disputes: { select: { id: true, status: true } },
      },
    });
    return bills.map((b) => ({
      ...b,
      openDispute: b.disputes.find((d) => d.status !== 'CLOSED') ?? null,
      disputes: undefined,
    }));
  }

  /** 账单详情（快照）：含受影响该账单的调整明细与流水 */
  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id },
      include: {
        meter: { select: { meterNo: true } },
        resident: { select: { accountNo: true, address: true, user: { select: { name: true } } } },
        adjustmentLines: {
          include: { adjustment: true, ledgerEntry: true },
          orderBy: { adjustment: { createdAt: 'desc' } },
        },
        ledgerEntries: { orderBy: { createdAt: 'desc' } },
        disputes: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!bill) throw new NotFoundException('账单不存在');
    if (user.role !== ROLES.AGENT && bill.residentId !== user.residentId) {
      throw new NotFoundException('账单不存在');
    }
    return bill;
  }

  /** 读数曲线数据：整表全部读数，标明估抄/实抄/复核更正与被取代的原始估抄 */
  @Get(':id/readings')
  async readings(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const bill = await this.prisma.bill.findUnique({ where: { id } });
    if (!bill) throw new NotFoundException('账单不存在');
    if (user.role !== ROLES.AGENT && bill.residentId !== user.residentId) {
      throw new NotFoundException('账单不存在');
    }
    const readings = await this.prisma.meterReading.findMany({
      where: { meterId: bill.meterId },
      include: { supersededBy: { select: { id: true } } },
      orderBy: { date: 'asc' },
    });
    return {
      billPeriod: bill.period,
      startReadingId: bill.startReadingId,
      endReadingId: bill.endReadingId,
      readings: readings.map((r) => ({
        id: r.id,
        date: r.date,
        value: r.value,
        kind: r.kind,
        source: r.source,
        supersedesId: r.supersedesId,
        supersededById: r.supersededBy?.id ?? null,
        hasPhoto: !!r.photoToken,
        photoUrl: r.photoToken ? `/api/files/photos/${r.photoToken}` : null,
      })),
    };
  }
}
