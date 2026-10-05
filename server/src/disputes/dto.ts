import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateDisputeDto {
  @IsString()
  billId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ScheduleReviewDto {
  @IsString()
  @IsNotEmpty()
  scheduledAt!: string; // ISO 时间

  @IsOptional()
  @IsString()
  note?: string;
}

export class CorrectionDto {
  @IsString()
  readingId!: string;

  @IsInt()
  @Min(0)
  value!: number;
}

export class CompleteReviewDto {
  @IsString()
  @IsNotEmpty()
  receiptNo!: string; // 现场复核抄表回执号（幂等键）

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CorrectionDto)
  corrections!: CorrectionDto[];

  @IsString()
  @IsNotEmpty()
  reason!: string; // 调整原因，展示给住户
}

export class NoErrorDto {
  @IsString()
  @IsNotEmpty()
  note!: string;
}

export class RejectConclusionDto {
  @IsString()
  @IsNotEmpty()
  note!: string;
}
