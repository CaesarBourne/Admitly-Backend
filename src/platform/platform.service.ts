import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminUser } from '../admin-users/entities/admin-user.entity';
import { EntitlementsService, buildEntitlements } from '../billing/entitlements.service';
import { PlatformSettings } from '../billing/entities/platform-settings.entity';
import { PlanTier } from '../common/enums/plan.enum';
import { Organization } from '../organizations/entities/organization.entity';

export interface PlatformSettingsView {
  freeInviteLimit: number;
  paidInviteLimit: number;
  updatedAt: Date;
}

export interface PlatformOrganizationRow {
  id: string;
  name: string;
  slug: string;
  plan: PlanTier;
  /** null when the account just follows its plan's limit. */
  inviteLimitOverride: number | null;
  inviteLimit: number;
  inviteLimitSource: 'account' | 'plan';
  invitesUsed: number;
  invitesRemaining: number;
  canCreateInvite: boolean;
  adminEmails: string[];
  createdAt: Date;
}

const MAX_ROWS = 100;

@Injectable()
export class PlatformService {
  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(AdminUser) private readonly admins: Repository<AdminUser>,
    @InjectRepository(PlatformSettings)
    private readonly settingsRepo: Repository<PlatformSettings>,
    private readonly entitlements: EntitlementsService,
  ) {}

  async getSettings(): Promise<PlatformSettingsView> {
    const settings = await this.entitlements.getSettings();
    return this.toSettingsView(settings);
  }

  async updateSettings(changes: {
    freeInviteLimit?: number;
    paidInviteLimit?: number;
  }): Promise<PlatformSettingsView> {
    const settings = await this.entitlements.updateSettings(changes);
    return this.toSettingsView(settings);
  }

  /** Every account, newest first, with usage. Optional search matches the
   *  organization name, its slug, or one of its admin emails. */
  async listOrganizations(search?: string): Promise<PlatformOrganizationRow[]> {
    const query = (search ?? '').trim().toLowerCase();
    const qb = this.orgs.createQueryBuilder('org');

    if (query) {
      const like = `%${query}%`;
      const byEmail = await this.admins
        .createQueryBuilder('admin')
        .select('admin.orgId', 'orgId')
        .where('LOWER(admin.email) LIKE :like', { like })
        .limit(MAX_ROWS)
        .getRawMany<{ orgId: string }>();
      qb.where('(LOWER(org.name) LIKE :like OR LOWER(org.slug) LIKE :like)', { like });
      if (byEmail.length > 0) {
        qb.orWhere('org.id IN (:...orgIds)', { orgIds: byEmail.map((row) => row.orgId) });
      }
    }

    const orgs = await qb.orderBy('org.createdAt', 'DESC').take(MAX_ROWS).getMany();
    if (orgs.length === 0) return [];

    const ids = orgs.map((org) => org.id);
    const [counts, admins, settings] = await Promise.all([
      this.orgs.manager
        .createQueryBuilder()
        .select('invitee.orgId', 'orgId')
        .addSelect('COUNT(*)', 'count')
        .from('invitees', 'invitee')
        .where('invitee.orgId IN (:...ids)', { ids })
        .groupBy('invitee.orgId')
        .getRawMany<{ orgId: string; count: string }>(),
      this.admins
        .createQueryBuilder('admin')
        .select(['admin.orgId', 'admin.email'])
        .where('admin.orgId IN (:...ids)', { ids })
        .getMany(),
      this.entitlements.getSettings(),
    ]);

    const countsByOrg = new Map(counts.map((row) => [row.orgId, Number(row.count)]));
    const emailsByOrg = new Map<string, string[]>();
    for (const admin of admins) {
      const list = emailsByOrg.get(admin.orgId) ?? [];
      list.push(admin.email);
      emailsByOrg.set(admin.orgId, list);
    }

    return orgs.map((org) =>
      this.toOrganizationRow(
        org,
        settings,
        countsByOrg.get(org.id) ?? 0,
        (emailsByOrg.get(org.id) ?? []).sort(),
      ),
    );
  }

  async setOrganizationLimit(
    orgId: string,
    changes: { inviteLimit?: number | null; plan?: PlanTier },
  ): Promise<PlatformOrganizationRow> {
    const entitlements = await this.entitlements.setOrganizationLimit(orgId, changes);
    const [org, settings, admins] = await Promise.all([
      this.entitlements.findOrganization(orgId),
      this.entitlements.getSettings(),
      this.admins.find({ where: { orgId }, select: ['orgId', 'email'] }),
    ]);
    return this.toOrganizationRow(
      org,
      settings,
      entitlements.invitesUsed,
      admins.map((admin) => admin.email).sort(),
    );
  }

  private toSettingsView(settings: PlatformSettings): PlatformSettingsView {
    return {
      freeInviteLimit: settings.freeInviteLimit,
      paidInviteLimit: settings.paidInviteLimit,
      updatedAt: settings.updatedAt,
    };
  }

  private toOrganizationRow(
    org: Organization,
    settings: PlatformSettings,
    invitesUsed: number,
    adminEmails: string[],
  ): PlatformOrganizationRow {
    const entitlements = buildEntitlements(org, settings, invitesUsed);
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: entitlements.plan,
      inviteLimitOverride: org.inviteLimitOverride ?? null,
      inviteLimit: entitlements.inviteLimit,
      inviteLimitSource: entitlements.inviteLimitSource,
      invitesUsed: entitlements.invitesUsed,
      invitesRemaining: entitlements.invitesRemaining,
      canCreateInvite: entitlements.canCreateInvite,
      adminEmails,
      createdAt: org.createdAt,
    };
  }
}
