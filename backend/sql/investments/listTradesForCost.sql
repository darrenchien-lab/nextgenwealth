-- Every buy and sell with its local trade date, oldest first, for rebuilding
-- each holding's cost basis on any past date.
SELECT holding_id, type, quantity, total_amount, price_per_unit, TO_CHAR(occurred_at, 'YYYY-MM-DD') AS trade_date
FROM investment_transactions
WHERE user_id = $1
ORDER BY occurred_at, id
