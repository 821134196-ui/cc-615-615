import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

export class CreateDisputeDto {
  @IsInt()
  billId!: number;

  @IsString()
  reason!: string;
}

export class ScheduleReviewDto {
  @IsString()
  scheduledAt!: string; // ISO 时间
}

export class CompleteReviewDto {
  @IsIn(['NO_ERROR', 'ERROR_FOUND'])
  result!: 'NO_ERROR' | 'ERROR_FOUND';

  @ValidateIf((o) => o.result === 'ERROR_FOUND')
  @IsInt()
  @Min(0)
  correctedValue?: number;

  @IsOptional()
  @IsString()
  note?: string;

  /** 现场抄表回执编号；留空则由模拟抄表接口生成。重复回执将被拒绝 */
  @IsOptional()
  @IsString()
  receiptNo?: string;

  /** 调整原因（读数有误时必填） */
  @ValidateIf((o) => o.result === 'ERROR_FOUND')
  @IsString()
  reason?: string;
}

export class ResidentResponseDto {
  @IsBoolean()
  agree!: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
