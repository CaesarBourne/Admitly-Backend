import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Single-row settings table. `id` is always PLATFORM_SETTINGS_ID. */
export const PLATFORM_SETTINGS_ID = 'global';

export const DEFAULT_FREE_INVITE_LIMIT = 50;
export const DEFAULT_PAID_INVITE_LIMIT = 500;

@Entity('platform_settings')
export class PlatformSettings {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  /** Invites an account on the free plan may create, across all of its events. */
  @Column({ type: 'int', default: DEFAULT_FREE_INVITE_LIMIT })
  freeInviteLimit: number;

  /** Invites an account may create after upgrading to the paid plan. */
  @Column({ type: 'int', default: DEFAULT_PAID_INVITE_LIMIT })
  paidInviteLimit: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
