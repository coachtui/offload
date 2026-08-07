-- 017_terms_acceptance.sql — record when a user accepted the Terms of Service / Privacy Policy
ALTER TABLE hub.users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
