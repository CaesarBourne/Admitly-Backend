import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from '../admin-users/entities/admin-user.entity';
import { BillingModule } from '../billing/billing.module';
import { PlatformSettings } from '../billing/entities/platform-settings.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, AdminUser, PlatformSettings]),
    BillingModule,
  ],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
