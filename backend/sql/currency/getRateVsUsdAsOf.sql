-- The rate in effect at the end of a day: the last one fetched on or before it.
SELECT rate, fetched_at FROM exchange_rates
WHERE base_currency = 'USD' AND quote_currency = $1 AND fetched_at < ($2::date + 1)
ORDER BY fetched_at DESC
LIMIT 1
