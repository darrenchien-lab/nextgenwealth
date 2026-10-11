-- The first day allocation history is meaningful: once the app has saved
-- daily history and the user's accounts exist in it. Before the first
-- account was added, its balance back then is unknown (a backdated buy can
-- still leave older holding snapshots), so earlier dates aren't offered.
SELECT TO_CHAR(GREATEST(
  LEAST(
    (SELECT MIN(snapshot_date) FROM net_worth_snapshots WHERE user_id = $1),
    (SELECT MIN(snapshot_date) FROM investment_holding_snapshots WHERE user_id = $1)
  ),
  (SELECT MIN(created_at)::date FROM accounts WHERE user_id = $1)
), 'YYYY-MM-DD') AS start_date
