import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  CORS_ORIGINS: Joi.string().default('*'),

  JWT_SECRET: Joi.string().min(8).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),

  DB_TYPE: Joi.string().valid('sqlite', 'postgres').default('sqlite'),
  DB_DATABASE: Joi.string().required(),
  DB_HOST: Joi.string().optional(),
  DB_PORT: Joi.number().optional(),
  DB_USERNAME: Joi.string().optional(),
  DB_PASSWORD: Joi.string().optional().allow(''),
  DB_SSL: Joi.string().optional(),

  // Not required to boot (e.g. local dev without photo uploads configured yet),
  // but POST /invitees/:id/avatar will fail without them.
  SUPABASE_URL: Joi.string().uri().allow('').optional(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().allow('').optional(),
  SUPABASE_STORAGE_BUCKET: Joi.string().default('invitee-avatars'),

  APP_URL: Joi.string().uri().default('http://localhost:3000'),

  // Optional: without PAYSTACK_SECRET_KEY the app boots normally, but starting
  // an upgrade returns 503 until the credentials are added.
  PAYSTACK_SECRET_KEY: Joi.string().allow('').optional(),
  PAYSTACK_PUBLIC_KEY: Joi.string().allow('').optional(),
  PAYSTACK_CURRENCY: Joi.string().length(3).uppercase().default('NGN'),
  PAYSTACK_UPGRADE_AMOUNT_MINOR: Joi.number().integer().min(0).default(500000),
  PAYSTACK_CALLBACK_URL: Joi.string().uri().allow('').optional(),
  PAYSTACK_API_BASE_URL: Joi.string().uri().default('https://api.paystack.co'),

  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(120),
});
