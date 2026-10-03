SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1
