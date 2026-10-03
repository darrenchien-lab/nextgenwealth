UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1
