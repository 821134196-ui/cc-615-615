import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * 本地模拟通知接口：真实环境中对接短信/公众号网关，
 * 这里写入 Notification 表并打印日志，作为"已发送"的凭据。
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('MockNotify');

  constructor(private readonly prisma: PrismaService) {}

  async send(residentId: string, message: string) {
    this.logger.log(`[模拟通知] -> 住户 ${residentId}: ${message}`);
    await this.prisma.notification.create({ data: { residentId, message } });
  }
}
