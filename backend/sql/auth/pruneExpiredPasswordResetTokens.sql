DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '1 day'
