CREATE TABLE IF NOT EXISTS budgets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  period VARCHAR(7) NOT NULL, -- 'YYYY-MM'
  limit_amount NUMERIC(18, 2) NOT NULL CHECK (limit_amount > 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, category_id, period)
);
