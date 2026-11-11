-- Whether a signed-in request's token is still good: the account must still
-- exist, the token must not be on the revoked list, and it must have been
-- issued after the user's session cutoff (if any).
SELECT u.tokens_valid_after,
       EXISTS (SELECT 1 FROM revoked_tokens r WHERE r.token_id = $2) AS revoked
FROM users u WHERE u.id = $1
