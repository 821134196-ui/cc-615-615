import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';

@Module({
  imports: [AuthModule],
  controllers: [LedgerController],
  providers: [LedgerService],
})
export class LedgerModule {}
