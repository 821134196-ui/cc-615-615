import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MockNotificationService } from './mock-notification.service';

@Module({
  imports: [AuthModule],
  providers: [MockNotificationService],
  exports: [MockNotificationService],
})
export class NotificationModule {}
