-- Sessions issued before this moment are no longer valid. Set when a user
-- changes their password or signs out of every device; NULL means no cutoff.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_valid_after TIMESTAMP;
