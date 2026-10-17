-- Net amount added to a hand-tracked goal after a date, and its first entry.
SELECT COALESCE(SUM(amount) FILTER (WHERE occurred_at::date > $2), 0) AS added_since,
       TO_CHAR(MIN(occurred_at), 'YYYY-MM-DD') AS first_date
FROM goal_contributions
WHERE goal_id = $1
