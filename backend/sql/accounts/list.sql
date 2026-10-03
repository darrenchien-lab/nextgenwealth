SELECT * FROM accounts WHERE user_id = $1 AND is_archived = FALSE ORDER BY created_at ASC
