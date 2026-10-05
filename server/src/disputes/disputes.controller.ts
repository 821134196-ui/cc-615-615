import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser, CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../common/auth';
import { DisputesService } from './disputes.service';
import {
  CompleteReviewDto,
  CreateDisputeDto,
  NoErrorDto,
  RejectConclusionDto,
  ScheduleReviewDto,
} from './dto';

@Controller('disputes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post()
  @Roles('RESIDENT')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDisputeDto) {
    return this.disputes.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.disputes.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.disputes.get(user, id);
  }

  @Post(':id/schedule')
  @Roles('AGENT')
  schedule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ScheduleReviewDto) {
    return this.disputes.schedule(user, id, dto);
  }

  @Post(':id/complete-review')
  @Roles('AGENT')
  completeReview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CompleteReviewDto,
  ) {
    return this.disputes.completeReview(user, id, dto);
  }

  @Post(':id/no-error')
  @Roles('AGENT')
  noError(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: NoErrorDto) {
    return this.disputes.concludeNoError(user, id, dto);
  }

  @Post(':id/accept')
  @Roles('RESIDENT')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.disputes.accept(user, id);
  }

  @Post(':id/reject')
  @Roles('RESIDENT')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RejectConclusionDto) {
    return this.disputes.reject(user, id, dto);
  }
}
