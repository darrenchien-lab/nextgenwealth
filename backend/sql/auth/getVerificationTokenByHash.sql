SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token_hash = $1
