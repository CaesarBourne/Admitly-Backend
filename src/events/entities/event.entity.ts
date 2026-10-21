import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

/** Used when an event turns grouping on but doesn't name it. */
export const DEFAULT_GROUP_LABEL = 'Group';

/** One admission-tracked event (wedding, party, conference…) within an org. */
@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgId' })
  organization: Organization;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'datetime', nullable: true })
  eventDate: Date | null;

  /** Grouping invitees (tables, teams, sections…) is opt-in per event. */
  @Column({ default: false })
  groupingEnabled: boolean;

  /** What this event calls a group, e.g. "Table", "Team", "Cabin". Null → DEFAULT_GROUP_LABEL. */
  @Column({ type: 'varchar', nullable: true })
  groupLabel: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export function groupLabelOf(event: Pick<Event, 'groupLabel'> | null | undefined): string {
  return event?.groupLabel?.trim() || DEFAULT_GROUP_LABEL;
}
