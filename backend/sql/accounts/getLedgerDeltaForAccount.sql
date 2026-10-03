-- $2 is an optional cutoff timestamp (the latest manual balance adjustment,
-- if any) — pass NULL to sum the account's entire history. Combines every
-- category that actually moves a stored balance: plain transactions,
-- transfers in/out, and investment buys/sells linked to this account.
-- Previously only transactions were counted, which made this look "wrong"
-- for any account that had ever used a transfer or a linked investment
-- purchase — nearly every real account.
SELECT
  COALESCE((
    SELECT SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END)
    FROM transactions
    WHERE account_id = $1 AND ($2::timestamp IS NULL OR occurred_at > $2)
  ), 0)
  + COALESCE((
    SELECT SUM(-from_amount) FROM transfers
    WHERE from_account_id = $1 AND ($2::timestamp IS NULL OR occurred_at > $2)
  ), 0)
  + COALESCE((
    SELECT SUM(to_amount) FROM transfers
    WHERE to_account_id = $1 AND ($2::timestamp IS NULL OR occurred_at > $2)
  ), 0)
  + COALESCE((
    SELECT SUM(CASE WHEN type = 'buy' THEN -total_amount ELSE total_amount END)
    FROM investment_transactions
    WHERE account_id = $1 AND ($2::timestamp IS NULL OR occurred_at > $2)
  ), 0)
  AS ledger_delta
