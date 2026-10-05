import { Controller, Get, Patch, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: { id: number }) {
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { id: 'desc' },
      take: 50,
    });
  }

  @Patch(':id/read')
  async markRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number }) {
    // 只能标记自己的通知；找不到返回 404
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n || n.userId !== user.id) {
      return { ok: false };
    }
    await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    return { ok: true };
  }
}
