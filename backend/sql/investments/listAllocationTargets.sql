SELECT asset_name, target_percentage FROM investment_allocation_targets WHERE user_id = $1 ORDER BY target_percentage DESC
