import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { BillingService } from './billing.service';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.OWNER, Role.ADMIN)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('entitlements')
  @ApiOperation({ summary: "This account's plan, invite limit and current invite usage." })
  entitlements(@CurrentUser() admin: AuthUser) {
    return this.billing.getOverview(admin.orgId);
  }

  @Post('paystack/initialize')
  @ApiOperation({
    summary: 'Start a Paystack checkout that upgrades this account to the paid invite limit.',
  })
  initialize(@CurrentUser() admin: AuthUser) {
    return this.billing.initializeUpgrade(admin.orgId, admin.email);
  }

  @Get('paystack/verify')
  @ApiOperation({ summary: 'Verify a Paystack reference and apply the upgrade if it succeeded.' })
  verify(@CurrentUser() admin: AuthUser, @Query('reference') reference: string) {
    return this.billing.verifyCheckout(admin.orgId, reference);
  }

  /** Paystack calls this. It is public because the caller is not a logged-in
   *  user; authenticity comes from the HMAC-SHA512 signature instead. */
  @Public()
  @SkipThrottle()
  @Post('paystack/webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Paystack webhook (signature-verified).' })
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string | undefined,
  ) {
    return this.billing.handleWebhook(req.rawBody, signature);
  }
}
