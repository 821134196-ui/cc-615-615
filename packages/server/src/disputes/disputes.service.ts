import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { BillingCalcService } from '../billing/billing-calc.service';
import { shift } from '../billing/billing-calc.service';
import { MockMeterService } from '../meter/mock-meter.service';
import { MockNotificationService } from '../notification/mock-notification.service';
import {
  AdjustmentStatus,
  BillStatus,
  DisputeStatus,
  LedgerType,
  NotificationType,
  ReadingSource,
  ReadingType,
  ReviewResult,
} from '../common/enums';
import { CompleteReviewDto, CreateDisputeDto, ResidentResponseDto, ScheduleReviewDto } from './dto';

@Injectable()
export class DisputesService {
  constructor(
    private prisma: PrismaService,
    private calc: BillingCalcService,
    private mockMeter: MockMeterService,
    private notify: MockNotificationService,
  ) {}

  // ---------- 查询 ----------

  /** 异议列表：住户仅本人；客服可按住户过滤或看全部 */
  async list(user: { id: number; role: string }, residentId?: number) {
    const disputes = await this.prisma.dispute.findMany({
      where:
        user.role === 'AGENT'
          ? residentId
            ? { residentId: Number(residentId) }
            : undefined
          : { residentId: user.id },
      include: {
        bill: { include: { meter: true } },
        resident: true,
        reviews: { orderBy: { id: 'asc' } },
        adjustment: { include: { lines: true } },
      },
      orderBy: { id: 'desc' },
    });
    return disputes.map(serializeDispute);
  }

  /** 取异议并做归属校验（越权 404，不泄露存在性） */
  private async getOwned(id: number, user: { id: number; role: string }) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: {
        bill: { include: { meter: true } },
        resident: true,
        reviews: { orderBy: { id: 'asc' }, include: { correctedReading: { include: { photo: true } } } },
        adjustment: { include: { lines: { include: { ledgerEntry: true } } } },
      },
    });
    if (!dispute || (user.role !== 'AGENT' && dispute.residentId !== user.id)) {
      throw new NotFoundException('异议申请不存在');
    }
    return dispute;
  }

  async detail(id: number, user: { id: number; role: string }) {
    return serializeDispute(await this.getOwned(id, user));
  }

  // ---------- 住户：提交异议 ----------

  async create(user: { id: number; role: string }, dto: CreateDisputeDto) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: dto.billId },
      include: { meter: true },
    });
    if (!bill || bill.meter.userId !== user.id) {
      throw new NotFoundException('账单不存在');
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('请填写异议原因');
    }
    // 同一笔账存在未关闭异议时不得重复提交
    const open = await this.prisma.dispute.findFirst({
      where: { billId: bill.id, status: { not: DisputeStatus.CLOSED } },
    });
    if (open) {
      throw new ConflictException('该账期已有进行中的异议申请，请勿重复提交');
    }
    const dispute = await this.prisma.dispute.create({
      data: { billId: bill.id, residentId: user.id, reason: dto.reason.trim() },
    });
    const agents = await this.prisma.user.findMany({ where: { role: 'AGENT' } });
    await Promise.all(
      agents.map((a) =>
        this.notify.notify({
          userId: a.id,
          type: NotificationType.DISPUTE_RECEIVED,
          title: `新异议：${bill.periodKey} 账期`,
          body: `住户对 ${bill.meter.meterNo} 表 ${bill.periodKey} 账期账单提交异议：${dto.reason.trim()}`,
        }),
      ),
    );
    return this.detail(dispute.id, user);
  }

  // ---------- 客服：安排现场复核 ----------

  async schedule(id: number, agentId: number, dto: ScheduleReviewDto) {
    const dispute = await this.getOwned(id, { id: agentId, role: 'AGENT' });
    if (dispute.status !== DisputeStatus.SUBMITTED && dispute.status !== DisputeStatus.DISPUTED_AGAIN) {
      throw new ConflictException(`当前状态 ${dispute.status} 不能安排现场复核`);
    }
    const scheduledAt = new Date(dto.scheduledAt);
    if (isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('预约时间格式不正确');
    }
    await this.prisma.fieldReview.create({
      data: { disputeId: dispute.id, agentId, scheduledAt },
    });
    await this.prisma.dispute.update({
      where: { id: dispute.id },
      data: { status: DisputeStatus.SCHEDULED },
    });
    await this.notify.notify({
      userId: dispute.residentId,
      type: NotificationType.REVIEW_SCHEDULED,
      title: '现场复核已安排',
      body: `您 ${dispute.bill.periodKey} 账期账单的异议已安排现场复核，时间：${scheduledAt.toLocaleString('zh-CN')}`,
    });
    return this.detail(dispute.id, { id: agentId, role: 'AGENT' });
  }

  // ---------- 客服：完成现场复核（含跨期调整，核心事务） ----------

  async completeReview(id: number, agentId: number, dto: CompleteReviewDto) {
    const dispute = await this.getOwned(id, { id: agentId, role: 'AGENT' });
    if (dispute.status !== DisputeStatus.SCHEDULED) {
      throw new ConflictException('现场复核尚未安排或已完成，不能重复提交');
    }
    const review = dispute.reviews.find((r) => !r.completedAt);
    if (!review) throw new ConflictException('没有待完成的现场复核');

    if (dto.result === ReviewResult.NO_ERROR) {
      await this.prisma.$transaction([
        this.prisma.fieldReview.update({
          where: { id: review.id },
          data: { completedAt: new Date(), result: ReviewResult.NO_ERROR, note: dto.note ?? '现场复核读数与原记录一致' },
        }),
        this.prisma.dispute.update({ where: { id: dispute.id }, data: { status: DisputeStatus.REVIEWED } }),
      ]);
      await this.notify.notify({
        userId: dispute.residentId,
        type: NotificationType.REVIEW_DONE,
        title: '复核完成：读数无误',
        body: `经现场复核，${dispute.bill.periodKey} 账期抄表读数与原记录一致，原账单金额不变。如有异议可在结论页提出。`,
      });
      return this.detail(dispute.id, { id: agentId, role: 'AGENT' });
    }

    // ERROR_FOUND：读数有误 -> 实抄修正 + 跨期差额 + 调整单 + 流水
    if (dto.correctedValue === undefined || !dto.reason?.trim()) {
      throw new BadRequestException('读数有误时必须提供现场复核读数与调整原因');
    }
    const bill = await this.prisma.bill.findUniqueOrThrow({
      where: { id: dispute.billId },
      include: { meter: true, startReading: true, endReading: true },
    });

    const nextBill = await this.prisma.bill.findFirst({
      where: { meterId: bill.meterId, periodKey: shift(bill.periodKey, 1) },
      include: { startReading: true, endReading: true },
    });

    const disputedSpan = {
      billId: bill.id,
      periodKey: bill.periodKey,
      unitPrice: bill.unitPrice,
      startValue: bill.startReading.value,
      endValue: bill.endReading.value,
      usage: bill.usage,
    };
    const nextSpan = nextBill
      ? {
          billId: nextBill.id,
          periodKey: nextBill.periodKey,
          unitPrice: nextBill.unitPrice,
          startValue: nextBill.startReading.value,
          endValue: nextBill.endReading.value,
          usage: nextBill.usage,
        }
      : null;

    const monotonicError = this.calc.validateMonotonic(disputedSpan, nextSpan, dto.correctedValue);
    if (monotonicError) throw new BadRequestException(monotonicError);
    if (dto.correctedValue === bill.endReading.value) {
      throw new BadRequestException('现场读数与原期末读数一致，应选择“读数无误”');
    }

    // 重复抄表回执：同一回执不能再次调整（前置检查 + 数据库唯一约束兜底）
    let receiptNo = dto.receiptNo?.trim() || this.mockMeter.issueReceipt('RC');
    await this.assertReceiptUnused(receiptNo);

    // 同一笔账不能被重复调整
    await this.assertBillsNotAdjusted([bill.id, ...(nextBill ? [nextBill.id] : [])]);

    // 原始照片由本地模拟抄表接口落盘（先落盘再写库，事务回滚也不覆盖任何既有照片）
    const photoFile = this.mockMeter.uploadMeterPhoto({
      meterNo: bill.meter.meterNo,
      value: dto.correctedValue,
      periodKey: bill.periodKey,
      source: ReadingSource.ONSITE,
    });

    const lines = this.calc.computeCrossPeriodDelta(disputedSpan, nextSpan, dto.correctedValue);
    const totalDelta = lines.reduce((s, l) => s + l.deltaAmount, 0);

    try {
      await this.prisma.$transaction(async (tx) => {
        const photo = await tx.readingPhoto.create({
          data: {
            storagePath: photoFile.storagePath,
            originalFilename: photoFile.originalFilename,
            contentType: photoFile.contentType,
            sha256: photoFile.sha256,
          },
        });
        const correctedReading = await tx.meterReading.create({
          data: {
            meterId: bill.meterId,
            periodKey: bill.periodKey,
            value: dto.correctedValue!,
            readingType: ReadingType.ACTUAL,
            source: ReadingSource.ONSITE,
            readAt: new Date(),
            receiptNo,
            createdById: agentId,
          },
        });
        await tx.readingPhoto.update({ where: { id: photo.id }, data: { readingId: correctedReading.id } });

        await tx.fieldReview.update({
          where: { id: review.id },
          data: {
            completedAt: new Date(),
            result: ReviewResult.ERROR_FOUND,
            correctedReadingId: correctedReading.id,
            note: dto.note ?? null,
            receiptNo,
          },
        });

        const adjustment = await tx.adjustment.create({
          data: {
            disputeId: dispute.id,
            fieldReviewId: review.id,
            receiptNo,
            reason: dto.reason!.trim(),
            status: AdjustmentStatus.APPLIED,
            totalDelta,
            appliedAt: new Date(),
          },
        });

        for (const line of lines) {
          await tx.adjustmentLine.create({
            data: {
              adjustmentId: adjustment.id,
              billId: line.billId,
              periodKey: line.periodKey,
              kind: line.kind,
              deltaUsage: line.deltaUsage,
              deltaAmount: line.deltaAmount,
            },
          });
          await tx.bill.update({ where: { id: line.billId }, data: { status: BillStatus.ADJUSTED } });
          // 补收、退款分别记入流水（有符号金额；幂等键保证同一回执同一账期只入一次）
          await tx.ledgerEntry.create({
            data: {
              residentId: dispute.residentId,
              billId: line.billId,
              adjustmentLineId: (
                await tx.adjustmentLine.findFirstOrThrow({
                  where: { adjustmentId: adjustment.id, billId: line.billId },
                })
              ).id,
              periodKey: line.periodKey,
              type: line.kind === 'SURCHARGE' ? LedgerType.SURCHARGE : LedgerType.REFUND,
              amount: line.deltaAmount,
              idempotencyKey: `ADJ:${receiptNo}:${line.billId}`,
            },
          });
        }

        await tx.dispute.update({ where: { id: dispute.id }, data: { status: DisputeStatus.REVIEWED } });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('该抄表回执已用于调整，重复回执不能再次调整同一笔账');
      }
      throw e;
    }

    const surcharge = lines.filter((l) => l.kind === 'SURCHARGE').reduce((s, l) => s + l.deltaAmount, 0);
    const refund = lines.filter((l) => l.kind === 'REFUND').reduce((s, l) => s - l.deltaAmount, 0);
    await this.notify.notify({
      userId: dispute.residentId,
      type: NotificationType.ADJUSTMENT_APPLIED,
      title: '复核完成：账单已调整',
      body:
        `经现场实抄确认读数有误，调整单已生成。` +
        (refund ? `退款 ${(refund / 100).toFixed(2)} 元` : '') +
        (refund && surcharge ? '，' : '') +
        (surcharge ? `跨期补收 ${(surcharge / 100).toFixed(2)} 元` : '') +
        `（回执 ${receiptNo}）。请核对结论，仍有异议可在结论页提出。`,
    });
    return this.detail(dispute.id, { id: agentId, role: 'AGENT' });
  }

  // ---------- 住户：对复核结论表态 ----------

  async respond(id: number, user: { id: number; role: string }, dto: ResidentResponseDto) {
    const dispute = await this.getOwned(id, user);
    if (dispute.status !== DisputeStatus.REVIEWED) {
      throw new ConflictException('仅复核完成待确认的申请可以表态');
    }
    if (dto.agree) {
      await this.prisma.dispute.update({
        where: { id: dispute.id },
        data: { status: DisputeStatus.RESOLVED, residentNote: dto.note ?? null, residentDecidedAt: new Date() },
      });
    } else {
      if (!dto.note?.trim()) {
        throw new BadRequestException('不认可结论时请填写仍有异议的原因');
      }
      await this.prisma.dispute.update({
        where: { id: dispute.id },
        data: { status: DisputeStatus.DISPUTED_AGAIN, residentNote: dto.note.trim(), residentDecidedAt: new Date() },
      });
    }
    return this.detail(dispute.id, user);
  }

  // ---------- 客服：关闭申请（受守卫约束） ----------

  async close(id: number, agent: { id: number; role: string }) {
    const dispute = await this.getOwned(id, agent);
    // 业务红线：复核未完成或住户仍有异议时，不得关闭
    if (dispute.status === DisputeStatus.CLOSED) {
      throw new ConflictException('申请已关闭');
    }
    if (dispute.status !== DisputeStatus.RESOLVED) {
      const reason =
        dispute.status === DisputeStatus.DISPUTED_AGAIN
          ? '住户对结论仍有异议，不得关闭；请重新安排现场复核'
          : dispute.status === DisputeStatus.REVIEWED
            ? '复核结论尚待住户确认，不得关闭申请'
            : '复核尚未完成，不得关闭申请';
      throw new ConflictException(reason);
    }
    await this.prisma.dispute.update({ where: { id: dispute.id }, data: { status: DisputeStatus.CLOSED, closedAt: new Date() } });
    await this.notify.notify({
      userId: dispute.residentId,
      type: NotificationType.DISPUTE_CLOSED,
      title: '异议申请已关闭',
      body: `您 ${dispute.bill.periodKey} 账期账单的异议申请在您确认结论后已关闭。`,
    });
    return this.detail(dispute.id, agent);
  }

  // ---------- 守卫辅助 ----------

  private async assertReceiptUnused(receiptNo: string) {
    const [reading, review, adjustment] = await Promise.all([
      this.prisma.meterReading.findUnique({ where: { receiptNo } }),
      this.prisma.fieldReview.findUnique({ where: { receiptNo } }),
      this.prisma.adjustment.findUnique({ where: { receiptNo } }),
    ]);
    if (reading || review || adjustment) {
      throw new ConflictException(`抄表回执 ${receiptNo} 已使用，重复回执不能再次调整同一笔账`);
    }
  }

  private async assertBillsNotAdjusted(billIds: number[]) {
    const existing = await this.prisma.adjustmentLine.findFirst({
      where: { billId: { in: billIds } },
    });
    if (existing) {
      throw new ConflictException('相关账期账单已存在调整记录，不能重复调整同一笔账');
    }
  }
}

// ---------- 序列化 ----------

function serializeDispute(d: any) {
  return {
    id: d.id,
    status: d.status,
    reason: d.reason,
    residentNote: d.residentNote ?? null,
    residentDecidedAt: d.residentDecidedAt ?? null,
    closedAt: d.closedAt ?? null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    resident: { id: d.resident.id, username: d.resident.username, displayName: d.resident.displayName },
    bill: {
      id: d.bill.id,
      periodKey: d.bill.periodKey,
      version: d.bill.version,
      usage: d.bill.usage,
      unitPrice: d.bill.unitPrice,
      amount: d.bill.amount,
      status: d.bill.status,
      meter: { id: d.bill.meter.id, meterNo: d.bill.meter.meterNo, address: d.bill.meter.address, userId: d.bill.meter.userId },
    },
    reviews: (d.reviews ?? []).map((r: any) => ({
      id: r.id,
      scheduledAt: r.scheduledAt,
      completedAt: r.completedAt ?? null,
      result: r.result ?? null,
      note: r.note ?? null,
      receiptNo: r.receiptNo ?? null,
      correctedReading: r.correctedReading
        ? {
            id: r.correctedReading.id,
            value: r.correctedReading.value,
            readingType: r.correctedReading.readingType,
            source: r.correctedReading.source,
            readAt: r.correctedReading.readAt,
            photo: r.correctedReading.photo
              ? { id: r.correctedReading.photo.id, originalFilename: r.correctedReading.photo.originalFilename }
              : null,
          }
        : null,
    })),
    adjustment: d.adjustment
      ? {
          id: d.adjustment.id,
          receiptNo: d.adjustment.receiptNo,
          reason: d.adjustment.reason,
          status: d.adjustment.status,
          totalDelta: d.adjustment.totalDelta,
          appliedAt: d.adjustment.appliedAt,
          lines: (d.adjustment.lines ?? []).map((l: any) => ({
            id: l.id,
            billId: l.billId,
            periodKey: l.periodKey,
            kind: l.kind,
            deltaUsage: l.deltaUsage,
            deltaAmount: l.deltaAmount,
            ledgerEntry: l.ledgerEntry
              ? { id: l.ledgerEntry.id, type: l.ledgerEntry.type, amount: l.ledgerEntry.amount }
              : null,
          })),
        }
      : null,
  };
}
