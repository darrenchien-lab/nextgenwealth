INSERT INTO recurrence_rules (frequency, interval, next_due_date)
VALUES ($1, $2, $3)
RETURNING id
