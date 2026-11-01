-- Account-wide invite limits, platform admins and Paystack billing.
-- Run once against production Postgres (synchronize is off there) before
-- deploying the code that reads these columns.

-- ── organizations: plan + per-account limit override ─────────────────────────
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "plan" varchar NOT NULL DEFAULT 'free';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "inviteLimitOverride" int NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "planActivatedAt" timestamp NULL;

-- ── admin_users: app-wide admin flag (separate from the org-scoped role) ─────
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS "isPlatformAdmin" boolean NOT NULL DEFAULT false;

-- ── platform_settings: the single row of app-wide defaults ───────────────────
CREATE TABLE IF NOT EXISTS platform_settings (
  "id" varchar PRIMARY KEY,
  "freeInviteLimit" int NOT NULL DEFAULT 50,
  "paidInviteLimit" int NOT NULL DEFAULT 500,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

INSERT INTO platform_settings ("id", "freeInviteLimit", "paidInviteLimit")
VALUES ('global', 50, 500)
ON CONFLICT ("id") DO NOTHING;

-- ── payments: one row per Paystack checkout attempt ─────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "orgId" uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  "reference" varchar NOT NULL UNIQUE,
  "provider" varchar NOT NULL DEFAULT 'paystack',
  "amountMinor" int NOT NULL,
  "currency" varchar NOT NULL,
  "status" varchar NOT NULL DEFAULT 'pending',
  "channel" varchar NULL,
  "paidAt" timestamp NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_org ON payments ("orgId");
-- Invite usage is counted per account on every invite creation.
CREATE INDEX IF NOT EXISTS idx_invitees_org ON invitees ("orgId");
