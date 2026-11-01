import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PlanTier } from '../../common/enums/plan.enum';

/** The tenant root — effectively the customer account. Every Event, Invitee and
 *  SeatGroup belongs to exactly one, and so does the invite allowance. */
@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', unique: true })
  slug: string;

  @Column({ type: 'varchar', default: PlanTier.FREE })
  plan: PlanTier;

  /** Set by a platform admin to give this one account its own invite limit.
   *  When set it wins over the plan's limit; null means "follow the plan". */
  @Column({ type: 'int', nullable: true })
  inviteLimitOverride: number | null;

  @Column({ type: 'datetime', nullable: true })
  planActivatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
