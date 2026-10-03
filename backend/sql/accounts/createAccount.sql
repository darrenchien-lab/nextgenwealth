INSERT INTO accounts (user_id, name, type, currency, initial_balance, balance)
VALUES ($1, $2, $3, $4, $5, $5)
RETURNING id, user_id, name, type, currency, balance, is_archived, created_at
