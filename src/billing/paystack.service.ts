import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_PAYSTACK_BASE_URL = 'https://api.paystack.co';

export interface PaystackTransaction {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  channel?: string | null;
  metadata?: Record<string, unknown> | string | null;
  customer?: { email?: string };
}

export interface PaystackInitializeResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

interface PaystackEnvelope<T> {
  status?: boolean;
  message?: string;
  data?: T;
}

/** Thin Paystack client. Everything here needs PAYSTACK_SECRET_KEY; without it
 *  the app still boots and billing endpoints return 503, so the payment wall can
 *  be switched on later just by adding credentials. */
@Injectable()
export class PaystackService {
  private readonly logger = new Logger('Paystack');

  constructor(private readonly config: ConfigService) {}

  get secretKey(): string {
    return this.config.get<string>('paystack.secretKey') || '';
  }

  get isConfigured(): boolean {
    return this.secretKey.length > 0;
  }

  get amountMinor(): number {
    return this.config.get<number>('paystack.amountMinor')!;
  }

  get currency(): string {
    return this.config.get<string>('paystack.currency')!;
  }

  get baseUrl(): string {
    return this.config.get<string>('paystack.apiBaseUrl') || DEFAULT_PAYSTACK_BASE_URL;
  }

  get callbackUrl(): string {
    const explicit = this.config.get<string>('paystack.callbackUrl');
    if (explicit) return explicit;
    return `${this.config.get<string>('appUrl')!.replace(/\/+$/, '')}/admin/billing/callback`;
  }

  async initialize(params: {
    email: string;
    reference: string;
    metadata: Record<string, unknown>;
  }): Promise<PaystackInitializeResult> {
    const data = await this.request<{
      authorization_url: string;
      access_code: string;
      reference: string;
    }>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: params.email,
        amount: this.amountMinor,
        currency: this.currency,
        reference: params.reference,
        callback_url: this.callbackUrl,
        metadata: params.metadata,
      }),
    });
    return {
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      reference: data.reference,
    };
  }

  verify(reference: string): Promise<PaystackTransaction> {
    return this.request<PaystackTransaction>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
  }

  /** Paystack signs the raw webhook body with HMAC-SHA512 using the secret key. */
  isValidSignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    if (!this.isConfigured || !rawBody || !signature) return false;
    const expected = createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    const provided = Buffer.from(signature.trim().toLowerCase());
    const expectedBuffer = Buffer.from(expected);
    return (
      provided.length === expectedBuffer.length && timingSafeEqual(provided, expectedBuffer)
    );
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Payments are not configured yet — set PAYSTACK_SECRET_KEY on the server.',
      );
    }
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      this.logger.error(`Paystack request ${path} failed: ${err}`);
      throw new BadGatewayException('Could not reach Paystack. Please try again.');
    }

    const body = (await res.json().catch(() => null)) as PaystackEnvelope<T> | null;
    if (!res.ok || !body?.status || !body.data) {
      const message = body?.message || `Paystack request failed (${res.status}).`;
      this.logger.warn(`Paystack ${path} -> ${res.status}: ${message}`);
      throw new BadGatewayException(message);
    }
    return body.data;
  }
}
