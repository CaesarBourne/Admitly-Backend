import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { PlanTier } from '../common/enums/plan.enum';
import { PlatformService } from './platform.service';

export class UpdatePlatformSettingsDto {
  /** Applies to every account on the free plan that has no account-level override. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  freeInviteLimit?: number;

  /** Applies to every account that upgrades to the paid plan. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  paidInviteLimit?: number;
}

export class UpdateOrganizationLimitDto {
  /** Set a limit just for this account, or `null` to fall back to its plan. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  inviteLimit?: number | null;

  @IsOptional()
  @IsEnum(PlanTier)
  plan?: PlanTier;
}

@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Read the app-wide free and paid invite limits (platform admin).' })
  getSettings() {
    return this.platform.getSettings();
  }

  /** Raises (or lowers) the invite limit for every account that follows its plan. */
  @Patch('settings')
  @ApiOperation({
    summary: 'Change the invite limit for all free accounts and/or all paid accounts (platform admin).',
  })
  updateSettings(@Body() dto: UpdatePlatformSettingsDto) {
    return this.platform.updateSettings(dto);
  }

  @Get('organizations')
  @ApiOperation({
    summary: 'List accounts with their plan, invite limit and usage. Search by name, slug or admin email (platform admin).',
  })
  listOrganizations(@Query('search') search?: string) {
    return this.platform.listOrganizations(search);
  }

  /** Change one account's limit without touching anybody else's. */
  @Patch('organizations/:orgId/limits')
  @ApiOperation({ summary: "Set one account's invite limit and/or plan (platform admin)." })
  updateOrganizationLimit(
    @Param('orgId') orgId: string,
    @Body() dto: UpdateOrganizationLimitDto,
  ) {
    return this.platform.setOrganizationLimit(orgId, dto);
  }
}
