-- Every movement that has changed this account's stored balance, oldest
-- first: the same sources getLedgerDeltaForAccount sums (transactions,
-- transfers in/out, account-linked investment buys/sells) plus manual
-- balance corrections. `amount` is signed: positive adds to the balance,
-- negative takes away from it.
SELECT * FROM (
  SELECT t.occurred_at, t.created_at, 'transaction' AS source, t.id,
         CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END AS amount,
         t.notes AS description, c.name AS category_name, NULL AS counterparty,
         NULL::numeric AS quantity, FALSE AS is_reversal
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  WHERE t.account_id = $1

  UNION ALL
  SELECT f.occurred_at, f.created_at, 'transfer_out', f.id, -f.from_amount,
         f.notes, NULL, a.name, NULL, f.reverses_transfer_id IS NOT NULL
  FROM transfers f
  JOIN accounts a ON a.id = f.to_account_id
  WHERE f.from_account_id = $1

  UNION ALL
  SELECT f.occurred_at, f.created_at, 'transfer_in', f.id, f.to_amount,
         f.notes, NULL, a.name, NULL, f.reverses_transfer_id IS NOT NULL
  FROM transfers f
  JOIN accounts a ON a.id = f.from_account_id
  WHERE f.to_account_id = $1

  UNION ALL
  SELECT i.occurred_at, i.created_at, 'investment_' || i.type, i.id,
         CASE WHEN i.type = 'buy' THEN -i.total_amount ELSE i.total_amount END,
         i.asset_name, i.category, NULL, i.quantity, FALSE
  FROM investment_transactions i
  WHERE i.account_id = $1

  UNION ALL
  SELECT b.occurred_at, b.occurred_at, 'adjustment', b.id, b.delta,
         NULL, NULL, NULL, NULL, FALSE
  FROM balance_adjustments b
  WHERE b.account_id = $1
) entries
ORDER BY occurred_at ASC, created_at ASC, source ASC, id ASC
