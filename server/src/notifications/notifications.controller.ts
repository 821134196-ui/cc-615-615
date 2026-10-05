import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthUser, CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from './notifications.service';

class RequestOnsiteDto {
  @IsString()
  meterId!: string;
}

/**
 * 本地模拟抄表机接口：模拟燃气公司抄表系统。
 * - 客服申请现场复核抄表 → 返回带唯一回执号的抄表回执（含现场照片令牌）
 * - 回执号即幂等键：被消费后不能再次用于调整
 */
@Controller('mock')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MockMeterController {
  private static seq = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Post('meter-reading/onsite')
  @Roles('AGENT')
  async requestOnsiteReading(@Body() dto: RequestOnsiteDto) {
    const meter = await this.prisma.meter.findUnique({
      where: { id: dto.meterId },
      include: {
        readings: {
          orderBy: { date: 'desc' },
          include: { supersededBy: { select: { id: true } } },
        },
      },
    });
    if (!meter) return { error: '表计不存在' };
    const latest = meter.readings.find((r) => !r.supersededBy) ?? meter.readings[0];
    // 模拟抄表机：在当前有效读数基础上走一点字
    const value = (latest?.value ?? 0) + 3 + (MockMeterController.seq % 5);
    MockMeterController.seq += 1;
    const receipt = await this.prisma.meterReceipt.create({
      data: {
        receiptNo: `RCPT-${Date.now()}-${MockMeterController.seq}`,
        meterId: meter.id,
        value,
        takenAt: new Date(),
        photoToken: `receipt-photo-${meter.meterNo}-${Date.now()}`,
      },
    });
    return receipt;
  }

  @Get('receipts/:meterId')
  @Roles('AGENT')
  async receipts(@Param('meterId') meterId: string) {
    return this.prisma.meterReceipt.findMany({
      where: { meterId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 模拟通知网关的发件箱（演示用，客服可见） */
  @Get('notify/outbox')
  @Roles('AGENT')
  async outbox() {
    return this.prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    if (!user.residentId) return [];
    return this.prisma.notification.findMany({
      where: { residentId: user.residentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post(':id/read')
  async markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.residentId) return { ok: false };
    await this.prisma.notification.updateMany({
      where: { id, residentId: user.residentId },
      data: { isRead: true },
    });
    return { ok: true };
  }
}
