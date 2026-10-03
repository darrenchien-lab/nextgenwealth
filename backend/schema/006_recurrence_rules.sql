CREATE TABLE IF NOT EXISTS recurrence_rules (
  id SERIAL PRIMARY KEY,
  frequency VARCHAR(10) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  interval INTEGER NOT NULL DEFAULT 1,
  next_due_date DATE NOT NULL
);
