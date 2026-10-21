import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Event, groupLabelOf } from '../../events/entities/event.entity';
import { SeatGroup } from './seat-group.entity';

@Entity('invitees')
export class Invitee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgId: string;

  @Column({ type: 'uuid' })
  eventId: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @Column({ type: 'varchar' })
  name: string;

  /** Unique random token embedded in the invitee's QR code URL. */
  @Column({ type: 'varchar', unique: true })
  inviteToken: string;

  /** JWT ID of the invitee's currently active session (one-device enforcement). */
  @Column({ type: 'varchar', nullable: true })
  currentJti: string | null;

  @Column({ type: 'varchar', nullable: true })
  seatNumber: string | null;

  @Column({ type: 'uuid', nullable: true })
  seatGroupId: string | null;

  @ManyToOne(() => SeatGroup, (seatGroup) => seatGroup.invitees, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'seatGroupId' })
  seatGroup: SeatGroup | null;

  /** Tracks whether the invitee has been admitted at the entrance scan point. */
  @Column({ type: 'varchar', default: 'pending' })
  admissionStatus: 'pending' | 'admitted';

  @Column({ type: 'datetime', nullable: true })
  admittedAt: Date | null;

  /** General-purpose "not attending / disabled" flag. Invite/QR stays intact
   *  — this just moves them off the main list and can also be used to
   *  deactivate an invitee for any other reason. */
  @Column({ default: false })
  inactive: boolean;

  /** Object path within the Supabase Storage bucket, not a public URL. */
  @Column({ type: 'varchar', nullable: true })
  avatarPath: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Group info as shown to invitees/scanners — hidden when the event has grouping off.
 *  Expects `event` and `seatGroup` relations to be loaded. */
export function inviteeGroupInfo(invitee: Invitee) {
  const enabled = invitee.event?.groupingEnabled ?? false;
  return {
    seatGroupName: enabled ? (invitee.seatGroup?.name ?? null) : null,
    groupLabel: groupLabelOf(invitee.event),
  };
}
