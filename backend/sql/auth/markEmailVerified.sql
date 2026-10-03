UPDATE users SET email_verified_at = NOW() WHERE id = $1
