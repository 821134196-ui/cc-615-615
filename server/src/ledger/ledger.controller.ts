import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthUser, CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import { ROLES } from '../common/constants';
import { PrismaService } from '../prisma.service';

/** 补收/退款流水：住户只能看自己的 */
@Controller('ledger')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LedgerController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query('residentId') residentId?: string) {
    const where =
      user.role === ROLES.AGENT
        ? residentId
          ? { residentId }
          : {}
        : { residentId: user.residentId! };
    return this.prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        bill: { select: { period: true } },
        adjustmentLine: { include: { adjustment: { select: { reason: true, receiptNo: true } } } },
      },
    });
  }
}
