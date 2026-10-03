INSERT INTO insight_settings (user_id, active_provider, provider_config)
VALUES ($1, $2, $3)
ON CONFLICT (user_id) DO UPDATE SET active_provider = $2, provider_config = $3
RETURNING *
