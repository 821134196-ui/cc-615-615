import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { LedgerService } from './ledger.service';

@Controller('ledger')
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(private ledger: LedgerService) {}

  /** 费用流水：原账单扣费、跨期补收、退款分别列示 */
  @Get()
  list(@CurrentUser() user: { id: number; role: string }, @Query('residentId') residentId?: string) {
    return this.ledger.list(user, residentId ? Number(residentId) : undefined);
  }
}
