import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlanTier } from '../common/enums/plan.enum';
import { Invitee } from '../invitees/entities/invitee.entity';
import { Organization } from '../organizations/entities/organization.entity';
import {
  DEFAULT_FREE_INVITE_LIMIT,
  DEFAULT_PAID_INVITE_LIMIT,
  PLATFORM_SETTINGS_ID,
  PlatformSettings,
} from './entities/platform-settings.entity';

export type InviteLimitSource = 'account' | 'plan';

export interface EntitlementSummary {
  plan: PlanTier;
  /** How many invites the account may hold in total, across every event. */
  inviteLimit: number;
  /** `account` when a platform admin set a limit just for this account. */
  inviteLimitSource: InviteLimitSource;
  invitesUsed: number;
  invitesRemaining: number;
  canCreateInvite: boolean;
}

/** A per-account override always wins, so a platform admin can raise (or lower)
 *  one account without changing the plan defaults. */
export function resolveInviteLimit(
  org: Pick<Organization, 'plan' | 'inviteLimitOverride'>,
  settings: Pick<PlatformSettings, 'freeInviteLimit' | 'paidInviteLimit'>,
): { inviteLimit: number; inviteLimitSource: InviteLimitSource } {
  if (typeof org.inviteLimitOverride === 'number') {
    return { inviteLimit: org.inviteLimitOverride, inviteLimitSource: 'account' };
  }
  return {
    inviteLimit: org.plan === PlanTier.PAID ? settings.paidInviteLimit : settings.freeInviteLimit,
    inviteLimitSource: 'plan',
  };
}

export function buildEntitlements(
  org: Pick<Organization, 'plan' | 'inviteLimitOverride'>,
  settings: Pick<PlatformSettings, 'freeInviteLimit' | 'paidInviteLimit'>,
  invitesUsed: number,
): EntitlementSummary {
  const { inviteLimit, inviteLimitSource } = resolveInviteLimit(org, settings);
  const invitesRemaining = Math.max(0, inviteLimit - invitesUsed);
  return {
    plan: org.plan,
    inviteLimit,
    inviteLimitSource,
    invitesUsed,
    invitesRemaining,
    canCreateInvite: invitesRemaining > 0,
  };
}

/** Owns the "how many invites may this account still create?" question, plus
 *  the platform-wide defaults that back it. */
@Injectable()
export class EntitlementsService {
  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(PlatformSettings) private readonly settingsRepo: Repository<PlatformSettings>,
    @InjectRepository(Invitee) private readonly invitees: Repository<Invitee>,
  ) {}

  /** Returns the settings row, creating it on first use. */
  async getSettings(): Promise<PlatformSettings> {
    const existing = await this.settingsRepo.findOne({ where: { id: PLATFORM_SETTINGS_ID } });
    if (existing) return existing;
    try {
      return await this.settingsRepo.save(
        this.settingsRepo.create({
          id: PLATFORM_SETTINGS_ID,
          freeInviteLimit: DEFAULT_FREE_INVITE_LIMIT,
          paidInviteLimit: DEFAULT_PAID_INVITE_LIMIT,
        }),
      );
    } catch {
      // Another request created the row first — use that one.
      const created = await this.settingsRepo.findOne({ where: { id: PLATFORM_SETTINGS_ID } });
      if (!created) throw new Error('Could not initialize platform settings.');
      return created;
    }
  }

  async updateSettings(changes: {
    freeInviteLimit?: number;
    paidInviteLimit?: number;
  }): Promise<PlatformSettings> {
    const settings = await this.getSettings();
    if (changes.freeInviteLimit !== undefined) settings.freeInviteLimit = changes.freeInviteLimit;
    if (changes.paidInviteLimit !== undefined) settings.paidInviteLimit = changes.paidInviteLimit;
    return this.settingsRepo.save(settings);
  }

  async findOrganization(orgId: string): Promise<Organization> {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found.');
    return org;
  }

  /** Invites are counted per account (organization) and span every event. */
  countInvites(orgId: string): Promise<number> {
    return this.invitees.count({ where: { orgId } });
  }

  async getEntitlements(orgId: string): Promise<EntitlementSummary> {
    const [org, settings, invitesUsed] = await Promise.all([
      this.findOrganization(orgId),
      this.getSettings(),
      this.countInvites(orgId),
    ]);
    return buildEntitlements(org, settings, invitesUsed);
  }

  /** Throws 402 once the account is out of invites, so invite creation stops. */
  async assertInviteCapacity(orgId: string): Promise<EntitlementSummary> {
    const entitlements = await this.getEntitlements(orgId);
    if (entitlements.canCreateInvite) return entitlements;

    const message =
      entitlements.plan === PlanTier.FREE
        ? `Your account has used all ${entitlements.inviteLimit} invites on the free plan. Delete an invite or upgrade to keep inviting.`
        : `Your account has reached its ${entitlements.inviteLimit}-invite limit. Delete an invite to make room for another.`;

    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'InviteLimitReached',
        message,
        details: entitlements,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  /** Platform-admin change for one account. `inviteLimit: null` clears the
   *  override so the account falls back to its plan's limit. */
  async setOrganizationLimit(
    orgId: string,
    changes: { inviteLimit?: number | null; plan?: PlanTier },
  ): Promise<EntitlementSummary> {
    const org = await this.findOrganization(orgId);
    if (changes.inviteLimit !== undefined) org.inviteLimitOverride = changes.inviteLimit;
    if (changes.plan !== undefined && changes.plan !== org.plan) {
      org.plan = changes.plan;
      org.planActivatedAt = changes.plan === PlanTier.PAID ? new Date() : null;
    }
    await this.orgs.save(org);
    return this.getEntitlements(orgId);
  }

  async markPaid(orgId: string): Promise<void> {
    const org = await this.findOrganization(orgId);
    if (org.plan === PlanTier.PAID) return;
    org.plan = PlanTier.PAID;
    org.planActivatedAt = new Date();
    await this.orgs.save(org);
  }
}
