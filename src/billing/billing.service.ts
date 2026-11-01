import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { PlanTier } from '../common/enums/plan.enum';
import { Organization } from '../organizations/entities/organization.entity';
import { EntitlementSummary, EntitlementsService } from './entitlements.service';
import { Payment } from './entities/payment.entity';
import { PaystackService, PaystackTransaction } from './paystack.service';

export interface BillingOverview extends EntitlementSummary {
  upgrade: {
    provider: 'paystack';
    /** False until PAYSTACK_SECRET_KEY is set — the UI hides checkout until then. */
    configured: boolean;
    available: boolean;
    amountMinor: number;
    currency: string;
    paidInviteLimit: number;
  };
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger('Billing');

  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly entitlements: EntitlementsService,
    private readonly paystack: PaystackService,
  ) {}

  async getOverview(orgId: string): Promise<BillingOverview> {
    const [entitlements, settings] = await Promise.all([
      this.entitlements.getEntitlements(orgId),
      this.entitlements.getSettings(),
    ]);
    return {
      ...entitlements,
      upgrade: {
        provider: 'paystack',
        configured: this.paystack.isConfigured,
        available: entitlements.plan === PlanTier.FREE,
        amountMinor: this.paystack.amountMinor,
        currency: this.paystack.currency,
        paidInviteLimit: settings.paidInviteLimit,
      },
    };
  }

  /** Starts a Paystack checkout that raises this account to the paid plan. */
  async initializeUpgrade(
    orgId: string,
    email: string | null | undefined,
  ): Promise<{
    reference: string;
    authorizationUrl: string;
    accessCode: string;
    amountMinor: number;
    currency: string;
  }> {
    const org = await this.entitlements.findOrganization(orgId);
    if (org.plan === PlanTier.PAID) {
      throw new ConflictException('Your account is already on the paid plan.');
    }
    if (!this.paystack.isConfigured) {
      throw new ServiceUnavailableException(
        'Payments are not configured yet. Add PAYSTACK_SECRET_KEY on the server to enable upgrades.',
      );
    }
    if (!email) {
      throw new BadRequestException('Your account has no email address for a receipt.');
    }

    const reference = `admitly-${randomUUID()}`;
    const payment = await this.payments.save(
      this.payments.create({
        orgId: org.id,
        reference,
        provider: 'paystack',
        amountMinor: this.paystack.amountMinor,
        currency: this.paystack.currency,
        status: 'pending',
      }),
    );

    try {
      const init = await this.paystack.initialize({
        email,
        reference,
        metadata: { orgId: org.id, purpose: 'invite-limit-upgrade' },
      });
      return {
        reference: init.reference || reference,
        authorizationUrl: init.authorizationUrl,
        accessCode: init.accessCode,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
      };
    } catch (err) {
      await this.payments.update(payment.id, { status: 'failed' });
      throw err;
    }
  }

  /** Called by the frontend after Paystack redirects back with a reference. */
  async verifyCheckout(orgId: string, reference: string): Promise<BillingOverview & { status: string }> {
    if (!reference) throw new BadRequestException('A payment reference is required.');
    const payment = await this.payments.findOne({ where: { reference, orgId } });
    if (!payment) throw new NotFoundException('Payment not found.');

    if (payment.status === 'success') {
      return { status: 'success', ...(await this.getOverview(orgId)) };
    }

    const tx = await this.paystack.verify(reference);
    if (tx.status !== 'success') {
      if (tx.status === 'failed') {
        await this.payments.update(payment.id, { status: 'failed' });
      }
      return { status: tx.status, ...(await this.getOverview(orgId)) };
    }

    await this.applySuccessfulPayment(payment, tx);
    return { status: 'success', ...(await this.getOverview(orgId)) };
  }

  /** Paystack webhook entry point. Always answers 200 so Paystack stops retrying. */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<{ received: true }> {
    if (!this.paystack.isConfigured) {
      throw new UnauthorizedException('Payments are not configured.');
    }
    if (!this.paystack.isValidSignature(rawBody, signature)) {
      this.logger.warn('Rejected Paystack webhook with an invalid signature.');
      throw new UnauthorizedException('Invalid Paystack signature.');
    }

    let event: { event?: string; data?: { reference?: string } };
    try {
      event = JSON.parse(rawBody!.toString('utf8')) as typeof event;
    } catch {
      throw new BadRequestException('Invalid webhook payload.');
    }

    if (event.event !== 'charge.success' || !event.data?.reference) {
      return { received: true };
    }

    const payment = await this.payments.findOne({
      where: { reference: String(event.data.reference) },
    });
    if (!payment) {
      this.logger.warn(`Paystack webhook for unknown reference ${event.data.reference}.`);
      return { received: true };
    }
    if (payment.status === 'success') return { received: true };

    try {
      const tx = await this.paystack.verify(payment.reference);
      await this.applySuccessfulPayment(payment, tx);
    } catch (err) {
      // Log and acknowledge — Paystack retries, and the frontend can retry verify.
      this.logger.error(
        `Could not apply Paystack charge ${payment.reference}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
    return { received: true };
  }

  private async applySuccessfulPayment(
    payment: Payment,
    tx: PaystackTransaction,
  ): Promise<void> {
    if (tx.status !== 'success') {
      throw new BadRequestException(`Payment is not successful (status: ${tx.status}).`);
    }
    if (tx.amount !== payment.amountMinor) {
      throw new BadRequestException('Payment amount does not match the expected total.');
    }
    if (tx.currency?.toUpperCase() !== payment.currency.toUpperCase()) {
      throw new BadRequestException('Payment currency does not match the expected currency.');
    }

    await this.payments.update(payment.id, {
      status: 'success',
      paidAt: new Date(),
      channel: tx.channel ?? null,
    });
    await this.entitlements.markPaid(payment.orgId);
    this.logger.log(`Account ${payment.orgId} upgraded to the paid plan (${payment.reference}).`);
  }
}
