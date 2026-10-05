import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BillsService } from './bills.service';

@Controller('bills')
@UseGuards(JwtAuthGuard)
export class BillsController {
  constructor(private bills: BillsService) {}

  @Get()
  list(
    @CurrentUser() user: { id: number; role: string },
    @Query('residentId') residentId?: string,
  ) {
    return this.bills.list({
      userId: user.id,
      role: user.role,
      residentId: residentId ? Number(residentId) : undefined,
    });
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number; role: string }) {
    return this.bills.detail(id, user.id, user.role);
  }

  @Get('meter/:meterId/readings')
  curve(
    @Param('meterId', ParseIntPipe) meterId: number,
    @CurrentUser() user: { id: number; role: string },
  ) {
    return this.bills.readingCurve(meterId, user.id, user.role);
  }
}
