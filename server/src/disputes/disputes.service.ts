import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuthUser, DISPUTE_STATUS, LEDGER_TYPE, ROLES } from '../common/constants';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CalcError,
  computeAdjustmentLines,
  round2,
  validateCorrections,
} from '../adjustments/calc';
import {
  CompleteReviewDto,
  CreateDisputeDto,
  NoErrorDto,
  RejectConclusionDto,
  ScheduleReviewDto,
} from './dto';

const disputeInclude = {
  bill: true,
  events: { orderBy: { createdAt: 'asc' as const } },
  reviewTask: true,
  adjustments: {
    include: { lines: { include: { ledgerEntry: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
};

@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** 住户对某个账期账单提交异议 */
  async create(user: AuthUser, dto: CreateDisputeDto) {
    if (!user.residentId) throw new ForbiddenException('仅住户可提交异议');
    const bill = await this.prisma.bill.findUnique({ where: { id: dto.billId } });
    if (!bill || bill.residentId !== user.residentId) {
      throw new NotFoundException('账单不存在');
    }
    const open = await this.prisma.dispute.findFirst({
      where: { billId: bill.id, status: { not: DISPUTE_STATUS.CLOSED } },
    });
    if (open) throw new ConflictException('该账单已有未结案的异议，请勿重复提交');

    return this.prisma.dispute.create({
      data: {
        billId: bill.id,
        residentId: user.residentId,
        reason: dto.reason,
        events: {
          create: { actorName: user.name, action: 'SUBMIT', note: dto.reason },
        },
      },
      include: disputeInclude,
    });
  }

  async list(user: AuthUser) {
    const where = user.role === ROLES.AGENT ? {} : { residentId: user.residentId! };
    return this.prisma.dispute.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        bill: { select: { period: true, amount: true, usage: true } },
        resident: { select: { accountNo: true, address: true, user: { select: { name: true } } } },
      },
    });
  }

  async get(user: AuthUser, id: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: disputeInclude,
    });
    if (!dispute) throw new NotFoundException('异议不存在');
    if (user.role !== ROLES.AGENT && dispute.residentId !== user.residentId) {
      throw new NotFoundException('异议不存在'); // 不泄露他人数据存在性
    }
    return dispute;
  }

  /** 客服安排现场复核 */
  async schedule(user: AuthUser, id: string, dto: ScheduleReviewDto) {
    const dispute = await this.mustGet(id);
    if (dispute.status !== DISPUTE_STATUS.SUBMITTED) {
      throw new ConflictException('仅"已提交"状态的异议可以安排复核');
    }
    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('复核时间格式不正确');
    }
    await this.prisma.$transaction([
      this.prisma.reviewTask.upsert({
        where: { disputeId: id },
        create: { disputeId: id, assigneeName: user.name, scheduledAt },
        update: { assigneeName: user.name, scheduledAt, completedAt: null },
      }),
      this.prisma.dispute.update({
        where: { id },
        data: { status: DISPUTE_STATUS.REVIEW_SCHEDULED },
      }),
      this.prisma.disputeEvent.create({
        data: {
          disputeId: id,
          actorName: user.name,
          action: 'SCHEDULE',
          note: `预约上门复核时间：${scheduledAt.toLocaleString('zh-CN')}${dto.note ? `；${dto.note}` : ''}`,
        },
      }),
    ]);
    await this.notifications.send(
      dispute.residentId,
      `您对账期 ${dispute.bill.period} 的异议已受理，客服已安排现场复核（${scheduledAt.toLocaleString('zh-CN')}）。`,
    );
    return this.get(user, id);
  }

  /**
   * 客服提交现场复核结论并生成调整单。
   * 幂等：抄表回执号全局只能消费一次，重复回执不会再次调整同一笔账。
   */
  async completeReview(user: AuthUser, id: string, dto: CompleteReviewDto) {
    const dispute = await this.mustGet(id);
    if (dispute.status !== DISPUTE_STATUS.REVIEW_SCHEDULED) {
      throw new ConflictException('当前状态不能提交复核结论（需先安排现场复核）');
    }
    const meterId = dispute.bill.meterId;

    const receipt = await this.prisma.meterReceipt.findUnique({
      where: { receiptNo: dto.receiptNo },
    });
    if (!receipt) throw new BadRequestException('抄表回执号不存在');
    if (receipt.meterId !== meterId) {
      throw new BadRequestException('抄表回执与该住户表计不符');
    }
    if (receipt.consumedByAdjustmentId) {
      throw new ConflictException('该抄表回执已用于调整，不能重复调整同一笔账');
    }

    const readings = await this.prisma.meterReading.findMany({
      where: { meterId },
      include: { supersededBy: { select: { id: true } } },
      orderBy: { date: 'asc' },
    });
    const points = readings.map((r) => ({
      id: r.id,
      date: r.date,
      value: r.value,
      kind: r.kind,
      supersededById: r.supersededBy?.id ?? null,
    }));
    try {
      validateCorrections(points, dto.corrections);
    } catch (e) {
      throw new BadRequestException((e as CalcError).message);
    }

    const bills = await this.prisma.bill.findMany({ where: { meterId } });
    let lines;
    try {
      lines = computeAdjustmentLines(bills, dto.corrections);
    } catch (e) {
      throw new BadRequestException((e as CalcError).message);
    }
    if (lines.length === 0) {
      throw new BadRequestException('更正后各账期金额无变化，无需调整；请改用"读数无误"结论');
    }

    let adjustmentId: string;
    try {
      adjustmentId = await this.prisma.$transaction(async (tx) => {
        const totalDelta = round2(lines.reduce((s, l) => s + l.delta, 0));
        const adjustment = await tx.adjustment.create({
          data: {
            disputeId: id,
            billId: dispute.billId,
            receiptNo: dto.receiptNo,
            reason: dto.reason,
            totalDelta,
          },
        });
        for (const line of lines) {
          const createdLine = await tx.adjustmentLine.create({
            data: { adjustmentId: adjustment.id, ...line },
          });
          // 跨期补收、退款分别记入流水
          await tx.ledgerEntry.create({
            data: {
              residentId: dispute.residentId,
              billId: line.billId,
              adjustmentLineId: createdLine.id,
              period: line.period,
              type: line.delta > 0 ? LEDGER_TYPE.SURCHARGE : LEDGER_TYPE.REFUND,
              amount: Math.abs(line.delta),
            },
          });
        }
        // 更正读数另存新行，原始估抄读数与照片保留
        for (const c of dto.corrections) {
          const orig = readings.find((r) => r.id === c.readingId)!;
          await tx.meterReading.create({
            data: {
              meterId,
              date: orig.date,
              value: c.value,
              kind: 'ACTUAL',
              source: 'REVIEW',
              supersedesId: c.readingId,
              receiptNo: dto.receiptNo,
              photoToken: receipt.photoToken,
            },
          });
        }
        await tx.meterReceipt.update({
          where: { receiptNo: dto.receiptNo },
          data: { consumedByAdjustmentId: adjustment.id },
        });
        await tx.reviewTask.update({
          where: { disputeId: id },
          data: { completedAt: new Date() },
        });
        await tx.dispute.update({
          where: { id },
          data: { status: DISPUTE_STATUS.CONCLUSION_REACHED },
        });
        await tx.disputeEvent.create({
          data: {
            disputeId: id,
            actorName: user.name,
            action: 'ISSUE_ADJUSTMENT',
            note: dto.reason,
          },
        });
        return adjustment.id;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // 唯一约束兜底（并发/重试）：同一回执只能生成一次调整
        throw new ConflictException('该抄表回执已用于调整，不能重复调整同一笔账');
      }
      throw e;
    }

    await this.notifications.send(
      dispute.residentId,
      `您对账期 ${dispute.bill.period} 的异议已完成现场复核，调整单 ${adjustmentId.slice(-6)} 已生成，请核对补退明细并确认结论。`,
    );
    return this.get(user, id);
  }

  /** 客服结论：复核后确认读数无误 */
  async concludeNoError(user: AuthUser, id: string, dto: NoErrorDto) {
    const dispute = await this.mustGet(id);
    if (dispute.status !== DISPUTE_STATUS.REVIEW_SCHEDULED) {
      throw new ConflictException('当前状态不能提交复核结论');
    }
    await this.prisma.$transaction([
      this.prisma.reviewTask.update({
        where: { disputeId: id },
        data: { completedAt: new Date() },
      }),
      this.prisma.dispute.update({
        where: { id },
        data: { status: DISPUTE_STATUS.CONCLUSION_REACHED },
      }),
      this.prisma.disputeEvent.create({
        data: { disputeId: id, actorName: user.name, action: 'NO_ERROR', note: dto.note },
      }),
    ]);
    await this.notifications.send(
      dispute.residentId,
      `您对账期 ${dispute.bill.period} 的异议已完成复核：经现场核对读数无误。如有疑问可再次提出。`,
    );
    return this.get(user, id);
  }

  /** 住户接受结论 → 关闭（唯一的关闭途径，系统不自动关闭） */
  async accept(user: AuthUser, id: string) {
    const dispute = await this.mustGet(id);
    this.mustOwn(user, dispute.residentId);
    if (dispute.status !== DISPUTE_STATUS.CONCLUSION_REACHED) {
      throw new ConflictException('复核结论未出，暂不能确认结案');
    }
    await this.prisma.$transaction([
      this.prisma.dispute.update({ where: { id }, data: { status: DISPUTE_STATUS.CLOSED } }),
      this.prisma.disputeEvent.create({
        data: { disputeId: id, actorName: user.name, action: 'RESIDENT_ACCEPT', note: '住户确认结论，申请关闭' },
      }),
    ]);
    return this.get(user, id);
  }

  /** 住户对结论仍有异议 → 退回重新受理，绝不自动关闭 */
  async reject(user: AuthUser, id: string, dto: RejectConclusionDto) {
    const dispute = await this.mustGet(id);
    this.mustOwn(user, dispute.residentId);
    if (dispute.status !== DISPUTE_STATUS.CONCLUSION_REACHED) {
      throw new ConflictException('当前状态不能提出再异议');
    }
    await this.prisma.$transaction([
      this.prisma.dispute.update({ where: { id }, data: { status: DISPUTE_STATUS.SUBMITTED } }),
      this.prisma.disputeEvent.create({
        data: { disputeId: id, actorName: user.name, action: 'RESIDENT_REJECT', note: dto.note },
      }),
    ]);
    return this.get(user, id);
  }

  private async mustGet(id: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: { bill: true },
    });
    if (!dispute) throw new NotFoundException('异议不存在');
    return dispute;
  }

  private mustOwn(user: AuthUser, residentId: string) {
    if (user.role !== ROLES.AGENT && user.residentId !== residentId) {
      throw new NotFoundException('异议不存在');
    }
  }
}
