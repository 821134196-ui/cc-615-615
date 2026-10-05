import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Role } from '../common/enums';
import { DisputesService } from './disputes.service';
import { CompleteReviewDto, CreateDisputeDto, ResidentResponseDto, ScheduleReviewDto } from './dto';

@Controller('disputes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisputesController {
  constructor(private disputes: DisputesService) {}

  @Get()
  list(@CurrentUser() user: { id: number; role: string }, @Query('residentId') residentId?: string) {
    return this.disputes.list(user, residentId ? Number(residentId) : undefined);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number; role: string }) {
    return this.disputes.detail(id, user);
  }

  // 住户：按账期提交异议
  @Post()
  create(@CurrentUser() user: { id: number; role: string }, @Body() dto: CreateDisputeDto) {
    return this.disputes.create(user, dto);
  }

  // 客服：安排现场复核
  @Roles(Role.AGENT)
  @Post(':id/schedule')
  schedule(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @Body() dto: ScheduleReviewDto,
  ) {
    return this.disputes.schedule(id, user.id, dto);
  }

  // 客服：完成现场复核（读数无误 / 读数有误并生成调整单）
  @Roles(Role.AGENT)
  @Post(':id/complete-review')
  complete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @Body() dto: CompleteReviewDto,
  ) {
    return this.disputes.completeReview(id, user.id, dto);
  }

  // 住户：对复核结论表态（认可 / 仍有异议）
  @Roles(Role.RESIDENT)
  @Post(':id/respond')
  respond(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number; role: string },
    @Body() dto: ResidentResponseDto,
  ) {
    return this.disputes.respond(id, user, dto);
  }

  // 客服：关闭申请（仅住户确认结论后可关）
  @Roles(Role.AGENT)
  @Patch(':id/close')
  close(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number; role: string }) {
    return this.disputes.close(id, user);
  }
}
