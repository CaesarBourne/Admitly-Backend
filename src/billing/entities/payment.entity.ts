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

export type PaymentStatus = 'pending' | 'success' | 'failed';

/** One checkout attempt for an account upgrade. The reference is what Paystack
 *  echoes back on the callback and the webhook, so it is unique. */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgId' })
  organization: Organization;

  @Column({ type: 'varchar', unique: true })
  reference: string;

  @Column({ type: 'varchar', default: 'paystack' })
  provider: string;

  /** Amount in the currency's minor unit (kobo for NGN). */
  @Column({ type: 'int' })
  amountMinor: number;

  @Column({ type: 'varchar' })
  currency: string;

  @Column({ type: 'varchar', default: 'pending' })
  status: PaymentStatus;

  @Column({ type: 'varchar', nullable: true })
  channel: string | null;

  @Column({ type: 'datetime', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
