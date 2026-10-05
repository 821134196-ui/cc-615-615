import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface NotifyInput {
  userId: number;
  type: string;
  title: string;
  body: string;
}

/**
 * 本地模拟通知接口：真实系统中此处会调用短信/APP 推送网关。
 * 本地实现写入站内通知表并打印日志，保证流程可观测、可测试。
 */
@Injectable()
export class MockNotificationService {
  private readonly logger = new Logger(MockNotificationService.name);

  constructor(private prisma: PrismaService) {}

  async notify(input: NotifyInput) {
    const n = await this.prisma.notification.create({
      data: { userId: input.userId, type: input.type, title: input.title, body: input.body },
    });
    this.logger.log(`[模拟通知接口] -> 用户${input.userId} ${input.type}: ${input.title}`);
    return n;
  }
}
