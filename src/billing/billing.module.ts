import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invitee } from '../invitees/entities/invitee.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { EntitlementsService } from './entitlements.service';
import { Payment } from './entities/payment.entity';
import { PlatformSettings } from './entities/platform-settings.entity';
import { PaystackService } from './paystack.service';

@Module({
  imports: [TypeOrmModule.forFeature([Organization, Invitee, Payment, PlatformSettings])],
  controllers: [BillingController],
  providers: [BillingService, EntitlementsService, PaystackService],
  exports: [BillingService, EntitlementsService, PaystackService],
})
export class BillingModule {}
