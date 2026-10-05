import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { AuthController } from './auth/auth.controller';
import { JwtAuthGuard, RolesGuard } from './common/auth';
import { BillsController } from './bills/bills.controller';
import { DisputesController } from './disputes/disputes.controller';
import { DisputesService } from './disputes/disputes.service';
import { LedgerController } from './ledger/ledger.controller';
import { PhotosController } from './files/photos.controller';
import { MockMeterController, NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [
    AuthController,
    BillsController,
    DisputesController,
    LedgerController,
    PhotosController,
    MockMeterController,
    NotificationsController,
  ],
  providers: [PrismaService, DisputesService, NotificationsService, JwtAuthGuard, RolesGuard],
})
export class AppModule {}
