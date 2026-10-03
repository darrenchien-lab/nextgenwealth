UPDATE accounts SET is_archived = TRUE WHERE id = $1 RETURNING *
