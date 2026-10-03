SELECT rate, fetched_at FROM exchange_rates
WHERE base_currency = 'USD' AND quote_currency = $1
ORDER BY fetched_at DESC
LIMIT 1
