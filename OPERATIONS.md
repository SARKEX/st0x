# Website REST service traffic

## Credentials and request budgets

Production should provision three REST credentials:

- `ST0X_API_KEY` / `ST0X_API_SECRET` for the authenticated browser proxy,
  registry, and global orderbook.
- `ST0X_ACTIVITY_API_KEY` / `ST0X_ACTIVITY_API_SECRET` for public trade
  activity refreshes.
- `ST0X_PRICES_API_KEY` / `ST0X_PRICES_API_SECRET` for public midpoint-price
  refreshes.

Each dedicated pair falls back to the general pair only when both of its values
are absent, which allows a staged deployment. A partially configured dedicated
pair fails closed.

REST authentication and per-key rate limiting run before the REST response
cache. The selected accounting policy is therefore that every request reaching
REST, including a REST response-cache hit, consumes one request from that key.
Website memory, Redis, TanStack, and edge-cache hits do not reach REST and
consume no REST budget. Separate credentials keep public-price, activity, and
general website traffic from exhausting each other's API-side allowance.

## Cache and retry policy

- Public prices are fresh for 90 seconds. The last complete payload is retained
  for six hours and served when a refresh fails. Failed or partial refreshes
  never replace it.
- A REST `429` is not retried immediately. The price cache honors
  `Retry-After` before revalidation; browser price queries wait for the next
  scheduled refresh. Bounded browser retries remain enabled for network and
  server failures other than `429`.
- Public trade activity retains only complete snapshots for six hours.
  A cold refresh requests up to 500 trades per bounded REST page and uses a
  distributed Redis single-flight lock so separate website instances do not
  duplicate the pagination stream. The complete refresh aborts after 90 seconds.
- REST `Retry-After` cooldowns for price and activity refreshes are stored in
  Redis so they apply consistently across website instances.
- `GET /v1/tokens` is cached at the website edge for five minutes, with a
  one-hour stale-while-revalidate window.

Public-price REST failures emit structured `[monitor]` events with
`endpoint=public-prices`, `credentialLabel`, and status `429` when applicable.
The cache and fetcher tests enforce the regression threshold: concurrent cold
requests coalesce, and no second REST refresh occurs before `Retry-After`.
