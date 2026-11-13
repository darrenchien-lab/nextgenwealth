UPDATE users SET display_name = $1 WHERE id = $2 RETURNING id, email, display_name, created_at, email_verified_at
