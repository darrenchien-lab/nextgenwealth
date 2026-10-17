-- Every buy and sell on or before a date, with its holding's allocation
-- category and its local trade date.
SELECT t.holding_id, t.type, t.quantity, t.price_per_unit, t.currency,
  TO_CHAR(t.occurred_at, 'YYYY-MM-DD') AS trade_date,
  h.asset_name, h.category
FROM investment_transactions t
JOIN investment_holdings h ON h.id = t.holding_id
WHERE t.user_id = $1 AND t.occurred_at::date <= $2
