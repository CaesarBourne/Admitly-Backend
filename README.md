# Admitly Backend

Multi-tenant NestJS API behind Admitly: QR invite generation, invitee check-in,
entrance scanning/admission tracking, configurable-cap seating groups, and
admin-uploaded invitee photos.

## Data model

```
Organization (tenant)
  └─ AdminUser   (owner | admin — org staff who sign in with email/password)
  └─ Event       (one admission-tracked event, e.g. a wedding or conference)
       └─ Invitee     (QR invite token, seat number, admission status, photo)
       └─ SeatGroup   (named group with a configurable per-group max size)
```

Every query an admin makes is scoped by `orgId` pulled from their JWT — there
is no way for one organization's admin to read or modify another's data (see
`InviteesService`, `EventsService`, `SeatGroupsService`, and
`AuthService.inviteeInfo` for the scoping checks).

Two kinds of JWT share one `/auth/me`-style session shape, distinguished by
`type`:
- `admin` — an organization staff member. Scoped by `orgId`.
- `invitee` — someone who scanned their QR / followed their invite link.
  Scoped by `orgId` + `eventId`, one active device enforced via `jti`.

## Setup

```bash
npm install
cp .env.example .env   # defaults to local SQLite — no further setup needed
npm run start:dev
```

API: `http://localhost:3001` · Swagger docs: `http://localhost:3001/docs`

### Production database

Local dev uses an ephemeral SQLite file with `synchronize: true` (auto-DDL).
Production is expected to run Postgres with `synchronize: false` — holds
real tenant data, so schema changes are applied manually. Set `DB_TYPE=postgres`
plus the `DB_*` vars in `.env`, then apply `src/**/entities/*.ts` as SQL
against your Postgres provider (Supabase, RDS, etc.) before deploying.

### Invitee photo storage (Supabase Storage)

Admin-uploaded invitee photos go to a **private** Supabase Storage bucket,
served back through short-lived signed URLs (never a public URL):

1. Create a Supabase project.
2. In Storage, create a bucket named `invitee-avatars` (or your own name —
   match `SUPABASE_STORAGE_BUCKET`). Leave it **private**.
3. Copy the project URL and the `service_role` key (Settings → API) into
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

Without these set, everything else works — only photo upload/serving will
fail until configured.

## Key endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | Creates an Organization + its first (owner) admin |
| POST | `/auth/login` | Admin login |
| POST | `/auth/invitee` | Invitee exchanges their QR token for a session |
| POST | `/auth/invitee-info` | Admin scan lookup (org-scoped, no session created) |
| GET | `/auth/me` | Current session (admin or invitee) |
| GET/POST | `/events` | List/create events for your org |
| GET/POST | `/events/:eventId/invitees` | List/create invitees for an event |
| PATCH | `/invitees/:id/seat` | Set/clear seat number (unique per event) |
| PATCH | `/invitees/:id/seat-group` | Assign/clear seat group (enforces group's maxSize) |
| PATCH | `/invitees/:id/inactive` | Mark not-attending / deactivate, or reactivate |
| POST | `/invitees/:id/admit` | Mark admitted at the entrance |
| POST | `/invitees/:id/avatar` | Admin uploads an invitee's photo (multipart) |
| GET/POST/PATCH/DELETE | `/events/:eventId/seat-groups`, `/seat-groups/:id` | Seat group CRUD |
