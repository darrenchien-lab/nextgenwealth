INSERT INTO insight_settings (user_id, active_provider, provider_config, last_generated_at, last_insights)
VALUES ($1, $2, $3, NOW(), $4)
ON CONFLICT (user_id) DO UPDATE SET last_generated_at = NOW(), last_insights = $4
