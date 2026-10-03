SELECT DISTINCT currency FROM accounts WHERE user_id = $1 AND is_archived = FALSE
