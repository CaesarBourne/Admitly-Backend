import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Event } from '../../events/entities/event.entity';
import { Invitee } from './invitee.entity';

/** Optional named invitee group (a table, team, section…) scoped to one event.
 *  What a group is called is set per event via Event.groupLabel. */
@Entity('seat_groups')
export class SeatGroup {
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

  /** Per-group cap — configurable per customer rather than hardcoded. */
  @Column({ type: 'int', default: 8 })
  maxSize: number;

  @OneToMany(() => Invitee, (invitee) => invitee.seatGroup)
  invitees: Invitee[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
