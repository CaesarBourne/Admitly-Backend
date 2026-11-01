-- Optional, custom-named invitee grouping per event.
-- Run once against production Postgres (synchronize is off there).
ALTER TABLE events ADD COLUMN IF NOT EXISTS "groupingEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "groupLabel" varchar NULL;

-- Keep grouping on for events that already use seat groups, under their old name.
UPDATE events SET "groupingEnabled" = true, "groupLabel" = COALESCE("groupLabel", 'Seat group')
WHERE id IN (SELECT DISTINCT "eventId" FROM seat_groups);
