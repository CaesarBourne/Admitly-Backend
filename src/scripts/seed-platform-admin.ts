/**
 * Bootstraps (or promotes) the app-wide platform administrator.
 *
 * Put the variables in `admitly-backend/.env` (preferred, it is gitignored):
 *
 *   PLATFORM_ADMIN_EMAIL=you@example.com
 *   PLATFORM_ADMIN_PASSWORD=…
 *
 * …or export them for a single run:
 *
 *   PLATFORM_ADMIN_EMAIL=you@example.com PLATFORM_ADMIN_PASSWORD=… npm run seed:platform-admin
 *
 * Values are read *after* the Nest context is created, because it is AppModule's
 * ConfigModule that loads `.env` into process.env. Reading them earlier would
 * only ever see variables exported in the shell.
 *
 * - Existing account: promoted to platform admin (and password reset if
 *   PLATFORM_ADMIN_PASSWORD is set).
 * - New account: created inside PLATFORM_ADMIN_ORG_NAME (default
 *   "Admitly Platform"), which is required because every admin belongs to an org.
 *
 * Run the billing migration first when pointed at production Postgres, because
 * `is_platform_admin` and the new tables must exist.
 */
import { NestFactory } from '@nestjs/core';
import { AdminUsersService } from '../admin-users/admin-users.service';
import { AppModule } from '../app.module';
import { EntitlementsService } from '../billing/entitlements.service';
import { Role } from '../common/enums/role.enum';
import { OrganizationsService } from '../organizations/organizations.service';

function env(name: string, fallback?: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw || fallback;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const email = env('PLATFORM_ADMIN_EMAIL', 'caesaradek@gmail.com')!.toLowerCase();
    const password = env('PLATFORM_ADMIN_PASSWORD');
    const orgName = env('PLATFORM_ADMIN_ORG_NAME', 'Admitly Platform')!;
    const name = env('PLATFORM_ADMIN_NAME', 'Platform Owner')!;

    const admins = app.get(AdminUsersService);
    const organizations = app.get(OrganizationsService);
    const entitlements = app.get(EntitlementsService);

    const existing = await admins.findByEmail(email);
    if (existing) {
      await admins.promoteToPlatformAdmin(existing.id, password);
      console.log(
        `✓ ${email} is now a platform admin (organization ${existing.orgId})${
          password ? ' — password reset' : ''
        }.`,
      );
    } else {
      if (!password) {
        throw new Error(
          `No account exists for ${email} and PLATFORM_ADMIN_PASSWORD is not set.\n` +
            'Add both to admitly-backend/.env (gitignored), for example:\n' +
            `  PLATFORM_ADMIN_EMAIL=${email}\n` +
            '  PLATFORM_ADMIN_PASSWORD=choose-a-strong-password\n' +
            'then re-run `npm run seed:platform-admin`.',
        );
      }
      const org = await organizations.findOrCreateByName(orgName);
      const admin = await admins.create({
        orgId: org.id,
        email,
        password,
        name,
        role: Role.OWNER,
      });
      await admins.promoteToPlatformAdmin(admin.id);
      console.log(`✓ Created ${email} as a platform admin in "${org.name}".`);
    }

    const settings = await entitlements.getSettings();
    console.log(
      `✓ Invite limits — free: ${settings.freeInviteLimit}, paid: ${settings.paidInviteLimit}.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
