INSERT INTO revoked_tokens (token_id, expires_at)
VALUES ($1, $2)
ON CONFLICT (token_id) DO NOTHING
