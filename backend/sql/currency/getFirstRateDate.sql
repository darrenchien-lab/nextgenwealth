SELECT TO_CHAR(MIN(fetched_at), 'YYYY-MM-DD') AS first_date FROM exchange_rates WHERE base_currency = 'USD'
