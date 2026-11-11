-- $2 is the number of seconds to add after the current second: 0 keeps a
-- session issued right after this call valid (password change, which hands
-- out a new token), 1 ends every session including one issued this second.
UPDATE users SET tokens_valid_after = date_trunc('second', NOW()) + ($2::int * INTERVAL '1 second') WHERE id = $1
