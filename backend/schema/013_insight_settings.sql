CREATE TABLE IF NOT EXISTS insight_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_provider VARCHAR(20) NOT NULL DEFAULT 'rule_based' CHECK (active_provider IN ('rule_based', 'external_ai')),
  provider_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_generated_at TIMESTAMP,
  last_insights JSONB
);
