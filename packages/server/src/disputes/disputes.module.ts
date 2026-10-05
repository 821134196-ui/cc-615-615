import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { MockNotificationService } from '../notification/mock-notification.service';
import { NotificationsController } from '../notification/notifications.controller';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [DisputesController, NotificationsController],
  providers: [DisputesService, MockNotificationService],
})
export class DisputesModule {}
