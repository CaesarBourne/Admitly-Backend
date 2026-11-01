# Admitly Backend Documentation

**Last updated:** 2026-10-23

The Admitly backend is a multi-tenant NestJS API. It powers:

- **Organizations**: each customer gets its own workspace, and its data is kept separate from every other workspace.
- **Admin accounts**: staff sign in with an email and password.
- **Events**: each organization can run many events, such as a wedding, a conference or a launch party.
- **Invitees and QR codes**: each invitee gets a unique token, and their QR code encodes a link containing it.
- **Admission management**: staff scan the QR code at the door and mark the invitee as admitted. A second scan is detected.
- **Seat numbers and optional grouping**: invitees can have a seat number, and an event can group them into tables, teams, sections and so on.
- **Invitee photos**: admins can upload photos, which are kept in a private Supabase Storage bucket.

The frontend is documented separately in [`admitly-frontend/ADMITLY_FRONTEND_DOCUMENTATION.md`](../admitly-frontend/ADMITLY_FRONTEND_DOCUMENTATION.md).

---

## Contents

1. [Tech stack](#1-tech-stack)
2. [Setup and configuration](#2-setup-and-configuration)
3. [Project structure](#3-project-structure)
4. [Data model](#4-data-model)
5. [Authentication, sessions and security](#5-authentication-sessions-and-security)
6. [Organizations and admin accounts](#6-organizations-and-admin-accounts)
7. [Events](#7-events)
8. [Invitees](#8-invitees)
9. [QR codes and invite tokens](#9-qr-codes-and-invite-tokens)
10. [Admission management](#10-admission-management)
11. [Seat numbers](#11-seat-numbers)
12. [Grouping (optional, custom-named)](#12-grouping-optional-custom-named)
13. [Invitee photos](#13-invitee-photos)
14. [API reference](#14-api-reference)
15. [Database and migrations](#15-database-and-migrations)
16. [Change history](#16-change-history)
17. [Plans, invite limits and billing](#17-plans-invite-limits-and-billing)
18. [Known limitations](#18-known-limitations)

---

## 1. Tech stack

| Concern | Choice |
|---|---|
| Framework | NestJS 10 (Express) |
| Language | TypeScript |
| ORM | TypeORM 0.3 |
| Database | SQLite (`better-sqlite3`) for local development, Postgres in production |
| Auth | `@nestjs/jwt` + `passport-jwt` (Bearer tokens); passwords hashed with `bcryptjs` (12 rounds) |
| Validation | `class-validator` / `class-transformer` for request bodies, Joi for environment variables |
| Rate limiting | `@nestjs/throttler` |
| File storage | Supabase Storage (private bucket, signed URLs) |
| API docs | Swagger at `/docs`; the spec is exported to `docs/swagger-spec.json` on every boot |

---

## 2. Setup and configuration

```bash
npm install
cp .env.example .env   # local SQLite by default, no other setup needed
npm run start:dev
```

- API: `http://localhost:3001`
- Swagger UI: `http://localhost:3001/docs`

| Script | Purpose |
|---|---|
| `npm run start:dev` | Watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run `dist/main.js` |
| `npm run lint` | ESLint with `--fix` |

### Environment variables

These are validated at boot in `src/config/validation.ts` and mapped in `src/config/configuration.ts`.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` \| `production` \| `test` |
| `PORT` | no | `3000` (`.env.example` sets `3001`) | HTTP port |
| `CORS_ORIGINS` | no | `*` | Comma-separated allowed origins. `*` allows any origin. Credentials are enabled. |
| `JWT_SECRET` | **yes** | – | Signing secret, at least 8 characters |
| `JWT_EXPIRES_IN` | no | `7d` | Token lifetime for both admin and invitee sessions |
| `DB_TYPE` | no | `sqlite` | `sqlite` or `postgres` |
| `DB_DATABASE` | **yes** | `./data/admitly.sqlite` | SQLite file path, or the Postgres database name |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` | Postgres only | `localhost`, `5432`, `postgres`, `postgres` | Postgres connection |
| `DB_SSL` | no | on | Set to `false` to turn TLS off (for example, for a local Postgres) |
| `SUPABASE_URL` | for photos | – | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | for photos | – | Service-role key, used server-side only |
| `SUPABASE_STORAGE_BUCKET` | no | `invitee-avatars` | Name of the private bucket |
| `APP_URL` | no | `http://localhost:3000` | Public frontend URL; Paystack returns buyers to `${APP_URL}/admin/billing/callback` |
| `PAYSTACK_SECRET_KEY` | for billing | – | Paystack secret key. While empty the app boots but upgrades return 503 |
| `PAYSTACK_PUBLIC_KEY` | no | – | Stored for reference; the hosted checkout doesn't need it |
| `PAYSTACK_CURRENCY` | no | `NGN` | Checkout currency (3-letter code) |
| `PAYSTACK_UPGRADE_AMOUNT_MINOR` | no | `500000` | Upgrade price in the currency's minor unit (kobo = ₦ × 100) |
| `PAYSTACK_CALLBACK_URL` | no | `${APP_URL}/admin/billing/callback` | Overrides the return URL |
| `PAYSTACK_API_BASE_URL` | no | `https://api.paystack.co` | Override for tests or a proxy |
| `THROTTLE_TTL` | no | `60` | Rate-limit window, in seconds |
| `THROTTLE_LIMIT` | no | `120` | Requests allowed per window |

The seed script (`npm run seed:platform-admin`) additionally reads `PLATFORM_ADMIN_EMAIL`,
`PLATFORM_ADMIN_PASSWORD`, `PLATFORM_ADMIN_NAME` and `PLATFORM_ADMIN_ORG_NAME`. They are not
needed to boot the app.

The app boots without the Supabase and Paystack variables. Photo upload/serving and billing
upgrades fail until they are set.

### Boot behaviour (`src/main.ts`)

- When using SQLite, creates the directory for the SQLite file.
- Applies a global `ValidationPipe` with these options:
  - `whitelist` and `forbidNonWhitelisted`: unknown body fields are rejected with a 400.
  - `transform` and implicit conversion.
- Registers `AllExceptionsFilter` globally.
- Configures CORS from `CORS_ORIGINS`.
- Creates the app with `rawBody: true`, which keeps the untouched request body so the Paystack
  webhook can verify its HMAC-SHA512 signature.
- Builds Swagger, writes `docs/swagger-spec.json` and serves the UI at `/docs`.

### Postgres host resolution (`src/app.module.ts`)

On some machines Node's `dns.lookup` intermittently fails with `ENOTFOUND`. To avoid this, `resolveHostReliably()` resolves the Postgres host to an IPv4 address up front, trying up to 4 times. If every attempt fails, it falls back to the hostname.

---

## 3. Project structure

```
src/
├── main.ts                     Bootstrap: validation, CORS, Swagger, error filter
├── app.module.ts               Config, throttling, TypeORM, global guards
├── config/                     configuration.ts (env → config), validation.ts (Joi schema)
├── common/
│   ├── decorators/             @CurrentUser, @Public, @Roles
│   ├── enums/role.enum.ts      Role.OWNER | Role.ADMIN
│   ├── enums/plan.enum.ts      PlanTier.FREE | PlanTier.PAID
│   └── filters/                AllExceptionsFilter (uniform JSON errors)
├── organizations/              Organization entity + service (tenant root)
├── admin-users/                AdminUser entity + service (staff accounts)
├── auth/                       Signup/login, invitee magic-link login, scan lookup, JWT strategy, guards
├── events/                     Event entity, service, controller (incl. grouping settings)
├── invitees/                   Invitee + SeatGroup entities; invitee, admission, seat, grouping, photo logic
├── billing/                    Invite entitlements, Paystack checkout, platform settings, payments
├── platform/                   App-wide admin endpoints for changing limits
├── scripts/                    seed-platform-admin.ts
└── storage/                    Supabase Storage wrapper (private bucket, signed URLs)
```

**Global guards** (registered in `app.module.ts`), applied to every request in this order:

1. `JwtAuthGuard`: every route requires a valid JWT unless it is marked `@Public()`.
2. `ThrottlerGuard`: rate-limits every route.

`RolesGuard` is applied per controller with `@UseGuards(RolesGuard)` and `@Roles(...)`.

---

## 4. Data model

```
Organization (tenant = customer account)
 ├─ AdminUser        staff account: owner | admin; isPlatformAdmin for app-wide admins
 ├─ Event            groupingEnabled, groupLabel
 │   ├─ Invitee      inviteToken (QR), seatNumber, admissionStatus, inactive, photo
 │   └─ SeatGroup    optional named group with a max size
 │       └─ Invitee  (many-to-one, nullable)
 └─ Payment          Paystack checkout attempts

PlatformSettings (single row)   freeInviteLimit / paidInviteLimit
```

Every table except `organizations` and `platform_settings` has an `orgId` column, and every admin query filters on it.

### `organizations`: `Organization`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `name` | varchar | display name |
| `slug` | varchar, unique | derived from the name (`acme-events`), with `-2`, `-3`… added on collision |
| `plan` | varchar | `free` (default) or `paid`. Set by a Paystack upgrade or by a platform admin |
| `inviteLimitOverride` | int, nullable | Platform-admin limit for this account. When set it wins over the plan's limit |
| `planActivatedAt` | datetime, nullable | When the account last moved to the paid plan |
| `createdAt`, `updatedAt` | timestamps | |

### `admin_users`: `AdminUser`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `orgId` | uuid | FK → organizations, `ON DELETE CASCADE` |
| `email` | varchar, unique | stored lower-cased and trimmed. Unique across the whole system, so one email maps to one organization. |
| `passwordHash` | varchar | bcrypt hash. `select: false`, so it is never returned by default. |
| `name` | varchar, nullable | |
| `role` | varchar | `owner` (default) or `admin` |
| `isPlatformAdmin` | boolean | default `false`. App-wide administrator: can read every account and change invite limits. Separate from `role` |
| `isActive` | boolean | default `true`. Inactive admins cannot log in, and their existing tokens are rejected. |
| `createdAt`, `updatedAt` | timestamps | |

### `events`: `Event`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `orgId` | uuid | FK → organizations, `ON DELETE CASCADE` |
| `name` | varchar | |
| `eventDate` | datetime, nullable | |
| `groupingEnabled` | boolean | default `false`. Whether this event groups invitees. |
| `groupLabel` | varchar, nullable | What a group is called ("Table", "Team"…). `null` means `"Group"`. |
| `createdAt`, `updatedAt` | timestamps | |

The entity file also exports two helpers:

- `DEFAULT_GROUP_LABEL = 'Group'`
- `groupLabelOf(event)`: the trimmed label, or the default

### `invitees`: `Invitee`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `orgId` | uuid | tenant scope |
| `eventId` | uuid | FK → events, `ON DELETE CASCADE` |
| `name` | varchar | |
| `inviteToken` | varchar, unique | 64 hex characters (32 random bytes). This is what the QR code encodes. |
| `currentJti` | varchar, nullable | ID of the invitee's single active session |
| `seatNumber` | varchar, nullable | unique within an event, enforced in the service |
| `seatGroupId` | uuid, nullable | FK → seat_groups, `ON DELETE SET NULL` |
| `admissionStatus` | varchar | `pending` (default) or `admitted` |
| `admittedAt` | datetime, nullable | set on first admission |
| `inactive` | boolean | default `false`. A general "not attending / disabled" flag; the invite stays valid. |
| `avatarPath` | varchar, nullable | object path inside the storage bucket, not a URL |
| `createdAt`, `updatedAt` | timestamps | |

Every row counts once against the account's invite allowance, which is why `orgId` is indexed
(`idx_invitees_org`, added by the 2026-10-22 migration). See §17.

The entity file also exports `inviteeGroupInfo(invitee)`, which returns `{ seatGroupName, groupLabel }`. `seatGroupName` is `null` when the event has grouping off. The helper needs the `event` and `seatGroup` relations to be loaded.

### `seat_groups`: `SeatGroup`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `orgId` | uuid | tenant scope |
| `eventId` | uuid | FK → events, `ON DELETE CASCADE` |
| `name` | varchar | unique within an event, enforced in the service. At most 40 characters. |
| `maxSize` | int | default `8`. Per-group capacity, between 1 and 1000. |
| `createdAt`, `updatedAt` | timestamps | |

### `platform_settings`: `PlatformSettings`

One row, `id = 'global'`, created on first use.

| Column | Type | Notes |
|---|---|---|
| `id` | varchar | primary key, always `global` |
| `freeInviteLimit` | int | default `50`. Invites per account, across all events, for free accounts |
| `paidInviteLimit` | int | default `500`. What a paid account gets |
| `updatedAt` | timestamp | |

### `payments`: `Payment`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `orgId` | uuid | FK → organizations, `ON DELETE CASCADE` |
| `reference` | varchar, unique | `admitly-<uuid>`; the reference Paystack echoes back |
| `provider` | varchar | `paystack` |
| `amountMinor` | int | price in the currency's minor unit |
| `currency` | varchar | e.g. `NGN` |
| `status` | varchar | `pending` (default), `success` or `failed` |
| `channel` | varchar, nullable | Paystack's channel (`card`, `bank`…) |
| `paidAt` | datetime, nullable | |
| `createdAt`, `updatedAt` | timestamps | |

---

## 5. Authentication, sessions and security

### Two kinds of session

Every JWT carries a `type`.

| Type | Who | JWT payload | Scope |
|---|---|---|---|
| `admin` | organization staff | `{ sub: adminId, type: 'admin', orgId, role }` | their `orgId` |
| `invitee` | a guest who opened their QR link | `{ sub: inviteeId, type: 'invitee', orgId, eventId, jti }` | their own `orgId` and `eventId` |

Tokens are sent as `Authorization: Bearer <token>`. They expire after `JWT_EXPIRES_IN` (7 days by default).

### Token validation (`src/auth/strategies/jwt.strategy.ts`)

The database is checked again on every request:

- **Admin tokens:** the admin must still exist and have `isActive = true`. The organization name is loaded so it can be returned.
- **Invitee tokens:** the invitee must still exist, and the token's `jti` must equal `invitee.currentJti`. If it doesn't, the request fails with 401 *"This session has been superseded. Please re-scan your QR code."*

The validated session object is the `AuthUser` shape in `common/decorators/current-user.decorator.ts`. It is what `GET /auth/me` returns.

| Session | Fields in `AuthUser` |
|---|---|
| Admin | `sub`, `type`, `orgId`, `orgName`, `role`, `isPlatformAdmin`, `email`, `name` |
| Invitee | `sub`, `type`, `orgId`, `eventId`, `name`, `seatNumber`, `seatGroupName`, `groupLabel`, `inactive`, `admissionStatus`, `jti` |

### One active device per invitee

Each call to `POST /auth/invitee` creates a new random `jti` and saves it as `currentJti`. That immediately invalidates any session on another device.

### Roles

- `Role.OWNER` and `Role.ADMIN` are defined in `common/enums/role.enum.ts`.
- Every admin controller uses `@Roles(Role.OWNER, Role.ADMIN)`, so both roles currently have the same permissions.
- `RolesGuard` **always rejects invitee sessions** on `@Roles` routes, whatever roles are listed, with 403 *"Insufficient privileges for this action."*
- `PlatformAdminGuard` is separate: it requires `isPlatformAdmin`, so a normal owner can't reach `/platform/*` even with a valid admin token.

### Public routes

These are marked `@Public()` and need no JWT:

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/invitee`
- `GET /invitees/:id/avatar`
- `POST /billing/paystack/webhook` (authenticated by its HMAC signature instead)

### Tenant isolation

- Admin queries are always filtered by the `orgId` from the JWT. This happens in `EventsService.findForOrg`, `InviteesService.findForOrg`, `SeatGroupsService.findForOrg` and `AuthService.inviteeInfo`.
- A record from another organization returns **404**, not 403, so its existence is not revealed.
- Endpoints that are nested under an event (for example `/events/:eventId/invitees`) first call `EventsService.findForOrg(eventId, orgId)`.

### Rate limiting

Every route is limited to `THROTTLE_LIMIT` requests per `THROTTLE_TTL` seconds (120 per 60 s by default). Going over the limit returns 429.

### Error format

`AllExceptionsFilter` returns every error in the same shape:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Seat 12 is already assigned to Jane Smith.",
  "path": "/invitees/…/seat",
  "timestamp": "2026-10-22T10:00:00.000Z"
}
```

- `message` can be an array when there are validation errors.
- `details` is included when an exception provides extra context, for example the invite usage on a 402 (see §17).
- 5xx errors are logged with their stack trace.

---

## 6. Organizations and admin accounts

### Signup: `POST /auth/signup` (public)

In one request, signup:

1. Creates an `Organization` from `orgName` (at most 100 characters), generating a unique slug.
   The new account starts on the **free** plan with 50 invites (see §17).
2. Creates its first `AdminUser` with role **owner**. The body needs:
   - `name` (at most 80 characters)
   - `email`, which must be unique across the system
   - `password` (at least 8 characters)
3. Returns `{ accessToken, user: { id, orgId, orgName, email, name, role, isPlatformAdmin } }`. `isPlatformAdmin` is `false` for a normal signup.

A duplicate email returns 409 *"An account with that email already exists."*

### Login: `POST /auth/login` (public)

- The body is `{ email, password }`. The email is matched case-insensitively.
- A wrong password, an unknown email and an inactive account all return the same 401 *"Invalid credentials."*
- The response has the same shape as signup.

### Current session: `GET /auth/me`

Returns the validated `AuthUser` (see §5) for either an admin or an invitee.

### What exists only in the service layer

`AdminUsersService` can:

- create admins with any role (`create`)
- list an organization's admins (`findAllForOrg`)

**No endpoint** exposes these yet. Inviting extra staff, changing roles and deactivating admins have no API (see §18).

---

## 7. Events

All event endpoints need an admin session (owner or admin) and are scoped to the admin's organization.

### Endpoints

| Method | Path | Body | Notes |
|---|---|---|---|
| `POST` | `/events` | `name` (required, ≤120), `eventDate?` (ISO date), `groupingEnabled?`, `groupLabel?` (≤30) | Creates an event. Grouping is off unless `groupingEnabled: true`. |
| `GET` | `/events` | – | The organization's events, newest first |
| `GET` | `/events/:id` | – | One event (404 if it belongs to another organization) |
| `PATCH` | `/events/:id` | any of `name`, `eventDate` (`null` clears it), `groupingEnabled`, `groupLabel` | Partial update. A blank `groupLabel` resets it to `"Group"`. |

### Response shape

```json
{
  "id": "uuid",
  "name": "Product Launch 2026",
  "eventDate": "2026-11-20T00:00:00.000Z",
  "groupingEnabled": true,
  "groupLabel": "Table",
  "createdAt": "…"
}
```

`groupLabel` is always a string here, with the default already applied.

---

## 8. Invitees

All invitee endpoints need an admin session, except the public photo URL. Every lookup is scoped to the organization.

### Create: `POST /events/:eventId/invitees`

- The body is `{ name }`, at most 80 characters.
- Before anything is created, `InviteesService.create()` calls
  `EntitlementsService.assertInviteCapacity(orgId)`. The allowance is per **account** and is
  shared by every event, so a full account gets **402 `InviteLimitReached`** here (see §17).
- A new invitee gets:
  - a fresh `inviteToken` (see §9)
  - `admissionStatus: 'pending'`
  - `inactive: false`
  - no seat, no group and no photo

### List and get

- `GET /events/:eventId/invitees`: all invitees for the event, oldest first, with their group.
- `GET /invitees/:id`: one invitee.

Both return this shape:

```json
{
  "id": "uuid",
  "eventId": "uuid",
  "name": "Jane Smith",
  "inviteToken": "64-hex-chars",
  "seatNumber": "12",
  "seatGroup": { "id": "uuid", "name": "VIP 3" },
  "admissionStatus": "pending",
  "admittedAt": null,
  "inactive": false,
  "avatarUrl": "/invitees/<id>/avatar",
  "createdAt": "…"
}
```

`seatGroup` is returned to admins even when the event has grouping off. The frontend hides it in that case.

### Inactive (not attending or disabled): `PATCH /invitees/:id/inactive`

- The body is `{ inactive: boolean }`.
- An inactive invitee **keeps their invite and QR code**. The flag only marks them as not attending (or deactivated for any other reason), and the admin UI moves them to a separate list.
- Setting `inactive: false` reactivates them.

### Delete: `DELETE /invitees/:id`

Permanently removes the invitee. Their QR link stops working (401 *"Invalid or expired invite link."*). Returns `{ deleted: true }`.

---

## 9. QR codes and invite tokens

The backend **does not render QR images**. It issues and checks the tokens that the QR codes contain.

### The token

- Created in `InviteesService.create` with `randomBytes(32).toString('hex')`: 64 hex characters, unique, impossible to guess in practice.
- It does not expire and cannot currently be regenerated.

### The link in the QR code

The frontend builds the link `https://<frontend-host>/invite?t=<inviteToken>` and encodes it as a QR image. Two things can happen to that link:

| Who opens or scans it | Endpoint | Result |
|---|---|---|
| **The invitee** (their own phone) | `POST /auth/invitee` `{ token }` (public) | Signs them in as that invitee. Returns `{ accessToken, user }`, where `user` contains `id`, `orgId`, `eventId`, `name`, `seatNumber`, `seatGroupName`, `groupLabel`, `inactive` and `admissionStatus`. Rotates `currentJti` (one device). An unknown token returns 401. |
| **Staff at the door** (admin session) | `POST /auth/invitee-info` `{ token }` (admin) | Looks the invitee up **without** creating a session. Returns `id`, `eventId`, `name`, `admissionStatus`, `admittedAt`, `seatNumber`, `seatGroupName`, `groupLabel` and `avatarUrl`. Returns 404 if the token is unknown or belongs to another organization. |

---

## 10. Admission management

Admission happens in two steps: look the invitee up by their QR token, then admit them.

```
Staff scans QR ──► POST /auth/invitee-info {token}  ──► invitee id + current status
                                                            │
                     staff taps "Admit to Event" ──► POST /invitees/:id/admit
```

### `POST /invitees/:id/admit` (admin)

- **If the invitee is `pending`:** sets `admissionStatus = 'admitted'` and `admittedAt = now`.
- **If they are already `admitted`:** it is **idempotent**. Nothing changes and the original `admittedAt` is returned. The frontend uses this to spot a re-used QR code.
- **Response:** `{ id, admissionStatus, admittedAt }`.

### Where admission status appears

- The admin invitee list and `GET /invitees/:id`, as `admissionStatus` and `admittedAt`.
- The scan lookup (`/auth/invitee-info`).
- The invitee's own session (`/auth/me`), so their welcome page can show "Already checked in".

Admission cannot currently be undone, and inactive invitees can still be admitted (see §17).

---

## 11. Seat numbers

`PATCH /invitees/:id/seat` (admin):

- **Body:** `{ seatNumber: string | null }`, at most 20 characters. `null` or an empty value clears the seat.
- **Uniqueness:** a seat number is unique within an event. A duplicate returns 409 *"Seat 12 is already assigned to Jane Smith."*
- **Independence:** seat numbers work separately from grouping, and are kept when a group is deleted.

---

## 12. Grouping (optional, custom-named)

Grouping invitees used to be always on and always called "Seat groups". Now each event decides two things:

- **Whether to group at all.** This is `Event.groupingEnabled`, off by default for new events.
- **What a group is called.** This is `Event.groupLabel`, for example "Table", "Team", "Section" or "Cabin", up to 30 characters. When it is blank, groups are called "Group".

Both are changed with `PATCH /events/:id` (or set on `POST /events`).

### Behaviour when grouping is off

- Groups and assignments **stay in the database**. Turning grouping back on restores them.
- Invitee-facing and scan responses (`/auth/invitee`, `/auth/me`, `/auth/invitee-info`) return `seatGroupName: null`. This happens through `inviteeGroupInfo()`.
- Admin endpoints (`/seat-groups`, `seatGroup` on invitee records) still work. The admin UI hides them.

### Group endpoints (admin)

The route and table names still say "seat group" for backwards compatibility.

| Method | Path | Body | Notes |
|---|---|---|---|
| `GET` | `/events/:eventId/seat-groups` | – | Groups with `guestCount`, oldest first |
| `POST` | `/events/:eventId/seat-groups` | `name` (≤40), `maxSize?` (1–1000, default 8) | 409 if the name already exists in this event |
| `PATCH` | `/seat-groups/:id` | `name?`, `maxSize?` | Rename or resize |
| `DELETE` | `/seat-groups/:id` | – | Members' `seatGroupId` becomes `null`. Their seat numbers are kept. |
| `PATCH` | `/invitees/:id/seat-group` | `{ seatGroupId: string \| null }` | Assigns or clears an invitee's group |

When an invitee is assigned to a group, the service checks three things:

- The group exists in the organization (otherwise 404 *"Group not found."*).
- It belongs to **the invitee's event** (otherwise 403 *"That group belongs to a different event."*).
- It is not full. If it already has `maxSize` invitees, the request fails with 409 *"\"VIP 3\" already has 8 invitees assigned."* Re-assigning an invitee to the group they are already in skips this check.

The group response looks like this:

```json
{ "id": "uuid", "eventId": "uuid", "name": "VIP 3", "maxSize": 8, "guestCount": 5, "createdAt": "…" }
```

---

## 13. Invitee photos

Admins upload photos, which are shown on the entrance-scan screen to confirm a guest's identity.

### Upload: `POST /invitees/:id/avatar` (admin)

- Multipart form with a `file` field, at most 8 MB.
- Allowed types are JPEG, PNG, WebP and GIF. Anything else returns 403.
- The file is stored at `<orgId>/<inviteeId>/<timestamp>-<originalname>` in the private bucket, and the path is saved in `avatarPath`.
- Returns `{ avatarUrl: "/invitees/<id>/avatar" }`.

### Serve: `GET /invitees/:id/avatar` (public)

- Public so that `<img>` tags can load it without auth headers.
- Creates a **5-minute signed URL** and responds with a `302` redirect to it, with `Cache-Control: private, max-age=60`.
- Returns 404 when the invitee has no photo.

### Storage

`StorageService` is a thin wrapper around Supabase Storage. The bucket stays **private**, and files are only ever served through signed URLs. To set it up:

1. Create a Supabase project.
2. Create a **private** bucket named `invitee-avatars`, or a name matching `SUPABASE_STORAGE_BUCKET`.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Settings → API).

---

## 14. API reference

Auth key: **Public** = no token; **Admin** = owner or admin session; **Platform admin** = an
admin whose `isPlatformAdmin` is true; **Any** = admin or invitee session.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | Public | Create an organization and its owner account |
| POST | `/auth/login` | Public | Admin login |
| POST | `/auth/invitee` | Public | Exchange a QR token for an invitee session |
| GET | `/auth/me` | Any | Current session |
| POST | `/auth/invitee-info` | Admin | Look up an invitee by QR token for the scan flow (no session created) |
| POST | `/events` | Admin | Create an event (optional grouping settings) |
| GET | `/events` | Admin | List the organization's events |
| GET | `/events/:id` | Admin | Get an event |
| PATCH | `/events/:id` | Admin | Update name, date or grouping settings |
| POST | `/events/:eventId/invitees` | Admin | Create an invitee and their QR token |
| GET | `/events/:eventId/invitees` | Admin | List an event's invitees |
| GET | `/invitees/:id` | Admin | Get an invitee |
| PATCH | `/invitees/:id/seat` | Admin | Set or clear the seat number |
| PATCH | `/invitees/:id/seat-group` | Admin | Assign or clear the group |
| PATCH | `/invitees/:id/inactive` | Admin | Mark inactive or reactivate |
| DELETE | `/invitees/:id` | Admin | Delete an invitee (their QR stops working) |
| POST | `/invitees/:id/admit` | Admin | Admit at the entrance (idempotent) |
| POST | `/invitees/:id/avatar` | Admin | Upload a photo (multipart `file`) |
| GET | `/invitees/:id/avatar` | Public | Redirect to a signed photo URL |
| GET | `/events/:eventId/seat-groups` | Admin | List groups |
| POST | `/events/:eventId/seat-groups` | Admin | Create a group |
| PATCH | `/seat-groups/:id` | Admin | Rename or resize a group |
| DELETE | `/seat-groups/:id` | Admin | Delete a group |
| GET | `/billing/entitlements` | Admin | Plan, invite limit and current invite usage for the account |
| POST | `/billing/paystack/initialize` | Admin | Start a Paystack checkout that upgrades the account |
| GET | `/billing/paystack/verify` | Admin | Verify a reference and apply the upgrade (`?reference=`) |
| POST | `/billing/paystack/webhook` | Public (signed) | Paystack charge notification |
| GET | `/platform/settings` | Platform admin | App-wide free and paid invite limits |
| PATCH | `/platform/settings` | Platform admin | Change the limits for all free and/or all paid accounts |
| GET | `/platform/organizations` | Platform admin | List accounts with usage (`?search=` name, slug or admin email) |
| PATCH | `/platform/organizations/:orgId/limits` | Platform admin | Set one account's invite limit and/or plan |

For full request and response schemas, see Swagger at `/docs` or `docs/swagger-spec.json`.

---

## 15. Database and migrations

| Environment | Database | Schema changes |
|---|---|---|
| Local | SQLite file (`./data/admitly.sqlite`) | `synchronize: true`: tables update automatically from the entities |
| Production | Postgres (for example Supabase) | `synchronize: false`: **changes are applied by hand** |

Production holds real tenant data, so there is no automatic DDL. Every entity change needs SQL, run in the provider's SQL editor **before** the new backend is deployed. Migration scripts are kept in `docs/migrations/`.

### `docs/migrations/2026-10-21-optional-grouping.sql`

```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS "groupingEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "groupLabel" varchar NULL;

-- Keep grouping on for events that already use seat groups, under their old name.
UPDATE events SET "groupingEnabled" = true, "groupLabel" = COALESCE("groupLabel", 'Seat group')
WHERE id IN (SELECT DISTINCT "eventId" FROM seat_groups);
```

The script can safely be run more than once.

### `docs/migrations/2026-10-22-invite-limits-and-platform-admin.sql`

Adds the account invite allowance, platform admins and Paystack billing:

- `organizations.plan`, `organizations.inviteLimitOverride`, `organizations.planActivatedAt`
- `admin_users.isPlatformAdmin`
- the `platform_settings` table, seeded with `free = 50`, `paid = 500`
- the `payments` table
- an index on `invitees.orgId`, because invite usage is counted per account

Like the previous script, it uses `IF NOT EXISTS` and can be run more than once.

**Deploy order:** migration → backend → `npm run seed:platform-admin` → frontend.

---

## 16. Change history

### 2026-10-22: Invite limits, platform admins and Paystack billing

**Why:** every account is limited to 50 invites in total (not per event), that limit can be
raised either for everyone or for one account, and accounts can pay through Paystack to move
to 500 invites.

**What changed:**

- **Data model:** `Organization.plan`, `inviteLimitOverride`, `planActivatedAt`;
  `AdminUser.isPlatformAdmin`; new `PlatformSettings` and `Payment` entities.
- **Enforcement:** `InviteesService.create()` now checks the account's allowance first and
  throws **402** with `error: "InviteLimitReached"` once it is used up.
- **New `billing` module:** `/billing/entitlements`, `/billing/paystack/initialize`,
  `/billing/paystack/verify`, `/billing/paystack/webhook`.
- **New `platform` module:** `/platform/settings` and `/platform/organizations…` for
  app-wide admins.
- **New `PlatformAdminGuard`** and `AuthUser.isPlatformAdmin` (also returned by
  `/auth/me`, `/auth/login` and `/auth/signup`).
- **Boot:** `rawBody: true` so the Paystack webhook can verify its signature.
- **Errors:** `AllExceptionsFilter` now passes through an exception's `details`.
- **Frontend:** usage card on the dashboard, a `/admin/billing` page with Paystack checkout
  and callback, and a `/admin/platform` page for limits.
- **Migration:** `docs/migrations/2026-10-22-invite-limits-and-platform-admin.sql` (see §15).
- **Seed:** `npm run seed:platform-admin` (see §17).

### 2026-10-21: Optional, custom-named grouping (`1fe5e51`)

**Why:** grouping was always on and its name was fixed as "Seat groups". It is now optional for each event, and each event names its groups.

**What changed:**

- **Data model:**
  - `Event` gained `groupingEnabled` (default `false`) and `groupLabel` (nullable), plus the helpers `DEFAULT_GROUP_LABEL` and `groupLabelOf()`.
  - `Invitee` gained the helper `inviteeGroupInfo()`.
  - `SeatGroup`'s doc comment was made generic.
- **API:**
  - New `PATCH /events/:id`.
  - `POST /events` accepts `groupingEnabled` and `groupLabel`.
  - Every event response includes both fields.
- **Sessions and scan:**
  - `/auth/invitee`, `/auth/me` and `/auth/invitee-info` now return `groupLabel`.
  - They return `seatGroupName: null` when grouping is off.
  - `InviteeAuthResult.user` and `AuthUser` gained `groupLabel`.
- **Queries:** `InviteesService.findForOrg`, `findById` and `findByToken` now also load the `event` relation.
- **Wording:** error messages and Swagger summaries say "group" instead of "seat group". The files affected are:
  - `seat-groups.service.ts`
  - `seat-groups.controller.ts`
  - `invitees.service.ts`
  - `invitees.controller.ts`
- **Migration:** `docs/migrations/2026-10-21-optional-grouping.sql` (see §15).
- **Compatibility:** routes, table names and the `seatGroupId` / `seatGroupName` fields are unchanged.

### 2026-10-11: README (`c2cb302`)

Added the README with setup steps, the data model and an endpoint table.

### 2026-10-11: Initial backend (`809407c`)

- Multi-tenant NestJS API: organizations, owner signup and admin login.
- Events.
- Invitees with QR invite tokens and magic-link invitee login (one device per invitee).
- Admin scan lookup and idempotent admission.
- Seat numbers (unique per event).
- Seat groups with a configurable size limit.
- The inactive flag.
- Invitee photos in private Supabase Storage.
- Global JWT auth and rate limiting.
- Uniform error format.
- Swagger.

---

## 17. Plans, invite limits and billing

### The rule

The **organization is the account**, and every invite it creates counts against one shared
allowance across all of its events — not per event.

| Plan | Default limit | Where the number comes from |
|---|---|---|
| `free` | 50 | `platform_settings.freeInviteLimit` |
| `paid` | 500 | `platform_settings.paidInviteLimit` |
| any | custom | `organizations.inviteLimitOverride` (wins over the plan) |

`resolveInviteLimit()` in `billing/entitlements.service.ts` picks the effective limit: the
account override first, otherwise the plan's default. `buildEntitlements()` adds the live
usage and returns the summary every endpoint uses.

### Enforcement

`InviteesService.create()` calls `EntitlementsService.assertInviteCapacity(orgId)` before
inserting the invitee. When the account is out of invites the request fails with **402
Payment Required**:

```json
{
  "statusCode": 402,
  "error": "InviteLimitReached",
  "message": "Your account has used all 50 invites on the free plan. Delete an invite or upgrade to keep inviting.",
  "details": {
    "plan": "free",
    "inviteLimit": 50,
    "inviteLimitSource": "plan",
    "invitesUsed": 50,
    "invitesRemaining": 0,
    "canCreateInvite": false
  },
  "path": "/events/…/invitees",
  "timestamp": "2026-10-22T10:00:00.000Z"
}
```

- Usage is a live `COUNT(*)` over `invitees` for the account, so deleting an invitee frees a
  slot immediately.
- Limits changed through `/platform/*` apply on the next request; nothing is cached.
- The check is count-then-insert, so two simultaneous creations at the boundary could exceed
  the limit by one (same trade-off as the group capacity check).

### Account-facing endpoint: `GET /billing/entitlements` (admin)

```json
{
  "plan": "free",
  "inviteLimit": 50,
  "inviteLimitSource": "plan",
  "invitesUsed": 12,
  "invitesRemaining": 38,
  "canCreateInvite": true,
  "upgrade": {
    "provider": "paystack",
    "configured": false,
    "available": true,
    "amountMinor": 500000,
    "currency": "NGN",
    "paidInviteLimit": 500
  }
}
```

- `inviteLimitSource` is `account` when a platform admin set a limit for this account.
- `upgrade.configured` is `false` until `PAYSTACK_SECRET_KEY` is set; the frontend then shows a
  "payments are not switched on yet" note instead of the checkout button.
- `upgrade.available` is `false` once the account is on the paid plan.

### Platform admin endpoints

`AdminUser.isPlatformAdmin` is separate from the org-scoped `role`: a platform admin can read
every account and change any limit, while an `owner` only ever sees their own organization.
`PlatformAdminGuard` protects everything under `/platform`.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/platform/settings` | – | `{ freeInviteLimit, paidInviteLimit, updatedAt }` |
| PATCH | `/platform/settings` | `{ freeInviteLimit?, paidInviteLimit? }` | Raises or lowers the limits **for everyone** on that plan |
| GET | `/platform/organizations?search=` | – | Accounts with `plan`, `inviteLimit`, `inviteLimitOverride`, `invitesUsed/Remaining`, `adminEmails`. Searches name, slug and admin email; newest 100 |
| PATCH | `/platform/organizations/:orgId/limits` | `{ inviteLimit?, plan? }` | Sets **one account's** limit and/or plan. `inviteLimit: null` clears the override |

`PATCH …/limits` is also the manual way to mark an account paid (`{ "plan": "paid" }`).

### Seeding the platform admin

Add the credentials to `admitly-backend/.env` (gitignored — **never** `.env.example`, which is
committed):

```dotenv
PLATFORM_ADMIN_EMAIL=caesaradek@gmail.com
PLATFORM_ADMIN_PASSWORD=choose-a-strong-password
PLATFORM_ADMIN_NAME=Platform Owner
PLATFORM_ADMIN_ORG_NAME=Admitly Platform
```

and run:

```bash
npm run seed:platform-admin
```

Exporting the same variables in the shell also works, and takes precedence over `.env`. The
variables are read **after** the Nest context is built, because that is when `ConfigModule`
loads `.env` into `process.env`; reading them earlier would only see shell exports.

`src/scripts/seed-platform-admin.ts` is idempotent:

- Existing email → promoted to platform admin and reactivated. The password is only reset when
  `PLATFORM_ADMIN_PASSWORD` is set.
- New email → created inside `PLATFORM_ADMIN_ORG_NAME` (default `Admitly Platform`), which is
  created on demand. Every admin must belong to an organization. If no password is configured it
  stops with an error explaining where to put one — it never invents a password.
- It also creates the `platform_settings` row if it is missing and prints both limits.

Run it after the §15 migration on production (or after the app has booted once on local
SQLite, where `synchronize` creates the columns).

### Paystack checkout

1. `POST /billing/paystack/initialize` (admin) creates a `payments` row and returns
   `{ reference, authorizationUrl, accessCode, amountMinor, currency }`.
   **503** while `PAYSTACK_SECRET_KEY` is empty, **409** when the account is already paid.
2. The buyer pays on Paystack's hosted page; Paystack redirects to
   `${APP_URL}/admin/billing/callback?reference=…` (or `PAYSTACK_CALLBACK_URL`).
3. `GET /billing/paystack/verify?reference=…` asks Paystack for the transaction, checks the
   amount and currency against the stored payment, marks it `success` and moves the account to
   the paid plan.
4. `POST /billing/paystack/webhook` does the same from the server side. It verifies the
   `x-paystack-signature` header as an HMAC-SHA512 of the **raw** body (hence `rawBody: true`),
   is exempt from throttling, and answers **200 for every validly signed event** — including
   unknown references and internal errors, which are logged — so Paystack stops retrying. A
   missing or wrong signature gets **401**, and so does a webhook while Paystack is unconfigured.

`PAYSTACK_UPGRADE_AMOUNT_MINOR` is the price in the currency's minor unit (kobo = ₦ × 100).
The account stays on the paid plan; there is no renewal, receipt email or downgrade flow yet.

---

## 18. Known limitations

These are behaviours of the current code that are worth knowing about. None of them are bugs that were introduced by the changes above.

| Area | Limitation |
|---|---|
| Organizations | No endpoints for managing staff: there is no way to invite extra admins, change a role or deactivate an admin. Only the owner from signup can sign in. Owner and admin currently have the same permissions. |
| Organizations | No endpoint to rename an organization or look it up by slug. |
| Events | No delete endpoint. |
| Invitees | The invite token never expires and cannot be regenerated. The only way to revoke a QR code is to delete the invitee. |
| Admission | It cannot be undone, and there is no check-in log beyond `admittedAt`. |
| Admission | Inactive invitees can still sign in with their QR code and can still be admitted. `inactive` only affects how the admin list is organized. |
| Grouping | A group's size count includes inactive invitees. Capacity is required (default 8); there is no "unlimited" option. |
| Grouping | The capacity check (count, then update) is not done in a transaction, so two assignments at the same moment could exceed `maxSize` by one. |
| Photos | Replacing or deleting an invitee doesn't remove the old file from storage (`StorageService.delete` exists but is unused). |
| Photos | `GET /invitees/:id/avatar` is public. Anyone who knows an invitee's UUID can view their photo. |
| Config | `PORT` defaults to `3000` in code but `3001` in `.env.example`, and the frontend expects `3001`. |
| Billing | The invite check is count-then-insert, so simultaneous creations at the limit could exceed it by one. |
| Billing | A platform-admin override wins over the plan, including a lower value after an account pays. |
| Billing | The paid plan is one-off and permanent: no renewal, expiry, refunds or downgrade flow. |
| Billing | Paystack is the only provider. `PAYSTACK_PUBLIC_KEY` is stored but unused (hosted checkout). |
| Billing | The platform admin list is capped at the 100 newest accounts and the payment history has no read endpoint. |
