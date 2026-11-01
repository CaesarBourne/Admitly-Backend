export default () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  /** Public URL of the frontend — used to build the Paystack return URL. */
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  corsOrigins: (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  jwt: {
    secret: process.env.JWT_SECRET || 'insecure-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  db: {
    type: (process.env.DB_TYPE || 'sqlite') as 'sqlite' | 'postgres',
    database: process.env.DB_DATABASE || './data/admitly.sqlite',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    // Hosted Postgres (Supabase, Render, etc.) requires TLS; local dev usually doesn't have it.
    ssl: process.env.DB_SSL !== 'false',
  },

  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'invitee-avatars',
  },

  /** Paystack is optional: with no secret key the app boots and the upgrade
   *  endpoints return 503, so billing can be switched on later. */
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    currency: (process.env.PAYSTACK_CURRENCY || 'NGN').toUpperCase(),
    /** Amount in the currency's minor unit (kobo for NGN). */
    amountMinor: parseInt(process.env.PAYSTACK_UPGRADE_AMOUNT_MINOR ?? '500000', 10),
    callbackUrl: process.env.PAYSTACK_CALLBACK_URL || '',
    /** Override for tests/staging proxies; defaults to Paystack's live API. */
    apiBaseUrl: (process.env.PAYSTACK_API_BASE_URL || 'https://api.paystack.co').replace(/\/+$/, ''),
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
  },
});
