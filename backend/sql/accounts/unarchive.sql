UPDATE accounts SET is_archived = FALSE WHERE id = $1 RETURNING *
