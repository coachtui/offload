-- 019_user_timezone.sql — per-user timezone for local-time scheduling (additive, idempotent)
-- last_seen_timezone: device IANA zone from the most recent recording's session
-- metadata (touched at ingest). Drives the weekly digest firing at Sunday 18:00
-- in the user's own zone instead of fixed HST. NULL = never recorded on a
-- timezone-aware build; consumers fall back to HST.

ALTER TABLE hub.users ADD COLUMN IF NOT EXISTS last_seen_timezone text;
