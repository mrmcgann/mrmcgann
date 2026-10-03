# Tyrebiter: notes for Claude Code

Next.js 15 App Router + TypeScript, Supabase (Postgres, Auth, Realtime, Storage), Stripe, Twilio, Resend. Plain CSS design system in `src/app/globals.css` (bright white + "flavour" colour backdrops, Plus Jakarta Sans + Fraunces italic). Keep that look.

## Where things live
- `supabase/migrations/` – schema, RLS, and the auction engine in SQL. **Money and bidding rules live in the database**: `place_bid`, `buy_now`, `make_offer`, `close_due_lots`, `admin_accept`, `admin_decline_referral`, `price_breakdown`, `create_invoice`. Change rules there, add a new migration file, never edit applied ones.
- `src/lib/fees.ts` mirrors `price_breakdown()` for the live preview. Keep them in step.
- Search: `src/lib/vehicles.ts` (the 10 categories, sub-types, makes and models), `src/lib/search.ts` (filter names, the plain-English parser, typeahead). The database side is `search_pred()` / `search_lots()` / `lot_facets()` and `queue_search_alerts()` in `20261003000006_search.sql`. A new filter needs all four: `FILTER_KEYS` + `cleanFilters`, `search_pred`, the alert sweep, and `SearchFilterPanel`. `search_pred` builds SQL from fixed text only; values are always read from `$1`.
- `src/lib/charges.ts` – off-session Stripe charge when an invoice is created.
- `src/app/api/cron/process` – every-minute clock.
- `src/content/legal.ts` – Terms, Help and Privacy copy (draft, needs legal review).
- Admin UI: `src/app/admin`, vehicle editor `src/components/LotEditor.tsx` (writes directly with the browser Supabase client; RLS allows admins).

## Rules
- Private data (reserve, leader's max, seller details) is in `lot_private`, admin-only. Never expose it in public queries.
- Members can't change verification/payment/role fields on `profiles` (trigger `protect_profile`). Server routes use the service-role client for those.
- Test mode: `NEXT_PUBLIC_TEST_MODE=true` fakes SMS (code 123456), card, ID and charges.

## Scale rules (tested at 1M accounts; keep them)
- Public data is read through `src/lib/cache.ts` (unstable_cache + cookie-less client). Don't query public data per request with the session client.
- Live prices: Realtime **Broadcast** on `lot:<id>` (trigger `broadcast_lot`) + `/api/lots/[id]/live` (edge-cached 1 s). Never `postgres_changes`, never `router.refresh()` per bid.
- Alerts: queue with `queue_notice` / `queue_notice_many` / `queue_seller_notice` (SQL) or `notify()` (TS); the sender is `drainOutbox`. Never call Twilio/Resend inline in a loop.
- Charging: `claim_invoice_charges` + Stripe idempotency keys (`src/lib/charges.ts`). Never charge an invoice that wasn't claimed.
- Row-level security uses `(select auth.uid())` / `(select public.is_admin())` so it's evaluated once per query. Index every new filter column.
- `npm run test:db` must pass; for big changes re-run `tests/load` (see README).

## Seller side
- `sign_seller_agreement` (server only) links `lots.seller_id`, stores disclosures, reserve, finance. `lot_publish_check` blocks going live until agreement + seller ID + ownership + VIN/PPSR (setting `selling.require_checks`).
- `bid_guard` blocks sellers (and their mobile) from bidding, and requires the current terms version.
- Payouts (`seller_payouts`) are created when an invoice is paid in full, held by open claims, released by `release_payouts()` after collection + claim window.

## Tests
`npm run test:db` (needs a local Postgres; see README). Run it after any change to `supabase/migrations`. `npm run test:unit` checks the search parser (run it after changing `vehicles.ts` or `search.ts`). `tests/load/search-bench.mjs` times search at scale.
