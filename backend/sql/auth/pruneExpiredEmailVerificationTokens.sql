DELETE FROM email_verification_tokens WHERE expires_at < NOW() - INTERVAL '1 day'
