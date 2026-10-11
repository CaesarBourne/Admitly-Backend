import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as dns from 'node:dns';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from './admin-users/entities/admin-user.entity';
import { AdminUsersModule } from './admin-users/admin-users.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import configuration from './config/configuration';
import { validationSchema } from './config/validation';
import { Event } from './events/entities/event.entity';
import { EventsModule } from './events/events.module';
import { Invitee } from './invitees/entities/invitee.entity';
import { SeatGroup } from './invitees/entities/seat-group.entity';
import { InviteesModule } from './invitees/invitees.module';
import { Organization } from './organizations/entities/organization.entity';
import { OrganizationsModule } from './organizations/organizations.module';
import { StorageModule } from './storage/storage.module';

const dnsLogger = new Logger('DatabaseDns');

/**
 * On some machines Node's dns.lookup() (used internally whenever pg/TypeORM
 * connects with a hostname) intermittently fails with ENOTFOUND even though
 * the hostname resolves fine at the OS/DNS level. Resolving to a literal IP
 * up front makes every connection this pool opens skip dns.lookup entirely.
 * Falls back to the original hostname if every attempt fails.
 */
async function resolveHostReliably(host: string, attempts = 4): Promise<string> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const addresses = await dns.promises.resolve4(host);
      if (addresses.length > 0) return addresses[0];
    } catch (err) {
      dnsLogger.warn(`Pre-resolve attempt ${attempt}/${attempts} for ${host} failed: ${err}`);
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 500));
    }
  }
  dnsLogger.warn(`Falling back to hostname ${host} after ${attempts} failed pre-resolve attempts.`);
  return host;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('throttle.ttl')! * 1000,
          limit: config.get<number>('throttle.limit')!,
        },
      ],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const type = config.get<'sqlite' | 'postgres'>('db.type');
        const common = {
          entities: [Organization, AdminUser, Event, Invitee, SeatGroup],
          autoLoadEntities: true,
        };
        if (type === 'postgres') {
          const configuredHost = config.get<string>('db.host')!;
          return {
            type: 'postgres' as const,
            host: await resolveHostReliably(configuredHost),
            port: config.get<number>('db.port'),
            username: config.get<string>('db.username'),
            password: config.get<string>('db.password'),
            database: config.get<string>('db.database'),
            ssl: config.get<boolean>('db.ssl') ? { rejectUnauthorized: false } : false,
            // Production holds real tenant data — no auto-DDL. Add columns/tables
            // manually (your Postgres provider's SQL editor) or temporarily flip
            // this on to sync a new entity, then flip back off.
            synchronize: false,
            ...common,
          };
        }
        return {
          type: 'better-sqlite3' as const,
          database: config.get<string>('db.database'),
          synchronize: true, // local/dev only — file is ephemeral, safe to auto-sync
          ...common,
        };
      },
    }),

    OrganizationsModule,
    AdminUsersModule,
    AuthModule,
    EventsModule,
    InviteesModule,
    StorageModule,
  ],
  providers: [
    // Every route requires a JWT unless @Public(); then rate-limit everything.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
