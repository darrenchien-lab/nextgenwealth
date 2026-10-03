INSERT INTO net_worth_snapshots (user_id, snapshot_date, net_worth, display_currency)
VALUES ($1, CURRENT_DATE, $2, $3)
ON CONFLICT (user_id, snapshot_date)
DO UPDATE SET net_worth = $2, display_currency = $3
