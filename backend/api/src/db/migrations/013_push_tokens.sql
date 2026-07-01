-- 013_push_tokens.sql — server→device push tokens + generic scheduled-job dedup state
CREATE TABLE IF NOT EXISTS hub.push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  platform   text CHECK (platform IN ('ios','android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON hub.push_tokens(user_id);

CREATE TABLE IF NOT EXISTS hub.job_state (
  job_name    text PRIMARY KEY,
  last_run_at timestamptz
);
