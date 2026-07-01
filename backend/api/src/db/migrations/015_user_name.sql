-- 015_user_name.sql — display name for greeting (collected at register, was never persisted)
ALTER TABLE hub.users ADD COLUMN IF NOT EXISTS name text;
