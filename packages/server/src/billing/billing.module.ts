import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingCalcService } from './billing-calc.service';
import { BillsService } from './bills.service';
import { BillsController } from './bills.controller';
import { PhotosService } from './photos.service';
import { PhotosController } from './photos.controller';
import { MockMeterService } from '../meter/mock-meter.service';

@Module({
  imports: [AuthModule],
  controllers: [BillsController, PhotosController],
  providers: [BillingCalcService, BillsService, PhotosService, MockMeterService],
  exports: [BillingCalcService, MockMeterService],
})
export class BillingModule {}
