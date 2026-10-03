CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_id VARCHAR(64) PRIMARY KEY,
  expires_at TIMESTAMP NOT NULL
);
