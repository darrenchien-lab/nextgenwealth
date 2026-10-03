ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

-- Grandfather every account created before this feature existed, so
-- accounts made via the pre-verification signup flow aren't locked out of
-- login. Uses a fixed cutoff (not NOW()) so this stays a no-op on every
-- future re-run of setup-db instead of grandfathering later registrations.
UPDATE users SET email_verified_at = created_at
WHERE email_verified_at IS NULL AND created_at < '2026-09-13 23:59:59';

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
