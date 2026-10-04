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

## Listings: photos, videos, bidders, consultants
- Gallery (`src/components/Gallery.tsx`, app `mobile/src/ui/Gallery.tsx`): big photo plus four, "+N", full-screen viewer, credits (`lot_photos.credit`/`credit_url`). Never fill listings with photos from other sites; `scripts/sample-photos.mjs` uses openly licensed Commons photos with credits.
- Videos (`20261003000008_media_partners.sql`): sellers/admins get a signed upload URL (`/api/videos/upload-url`) into the private bucket `video-uploads`, then `/api/videos` checks the file with `storage.info()` and calls `request_lot_video`. Admin approval (`approve-video` in `api/admin/[action]`) copies it to the public bucket `lot-videos`. No storage policies: all storage access is server-side. Orphan uploads are removed by the clock (`video_orphans`).
- Bidder names are never public: `bid_history` / `seller_lot_bids` return `bidder_mask` (a made-up name from a salted hash; salt in `app_secrets`, `bidder_mask()` not executable by clients). Shown blurred with `BlurName`. Don't add real names or per-member suffixes to any public payload.
- No in-person inspections. Buyers order a mobile inspection (partner kind `inspection`) or call the listing's consultant (`consultants`, `lots.consultant_id`, one default).
- Up to 10 photos and videos per listing, one of them a video (`lot_media_count`, trigger `lot_photo_limit`, `request_lot_video`; `MEDIA_MAX` in `src/lib/videos.ts`). Staff uploads from the editor are published straight away (`publishVideo` in `src/lib/videoPublish.ts`).
- Every listing is `registration` 'registered' (plate, state, current expiry) or 'unregistered' (sold without plates); `lot_publish_check` enforces it. Search filter `rego`.

## Sell page and plate lookups
- `src/lib/rego.ts` (shared: tidy provider data, category from body type, `publicVehicle` strips the full VIN) and `src/lib/regoLookup.ts` (server: providers chosen by `REGO_LOOKUP_PROVIDER`; test mode returns made-up vehicles). `/api/rego-lookup` caches results in `rego_lookups` (server only, pruned after 90 days) and rate-limits; never send the full VIN or engine number to the browser. `/api/appraisals` copies the full lookup into the request by `lookupId`.

## Transfer of ownership (between payment and collection)
- `ownership_transfers` (one per paid invoice, created by trigger `start_ownership_transfer`); buyer `transfer_submit`, seller `transfer_seller_done`, staff `admin_transfer_review`; `seller_lot_transfer` for the seller's view (never the buyer's documents). Trigger `collection_needs_transfer` blocks collection bookings until it's complete, so the address can't be released early. Proof files: private bucket `transfer-docs` via `/api/transfers/upload-url`.
- State steps and links: `src/lib/transfer.ts` (shared with the app). Certificate of sale PDF: `saleCertificatePdf` in `src/lib/pdf.ts`, `/api/invoices/[id]/certificate`.

## Partners: finance, insurance, inspections (revenue)
- Tables `partners` (public read of active), `partner_private` (lead email, admin only), `partner_leads` (admin only), `partner_clicks`. Read partners through `getPartnersCached()` (tag `partners`; sample partners hidden unless test mode).
- `/go/[slug]` is the tracked outbound link (fills `{amount}` etc., dedupes clicks per IP per day, skips bots and prefetches). `/api/leads` sends an enquiry: signed-in members with a verified mobile only (inspections need `can_bid`); it uses the profile's verified name/mobile/email, never the request body; stores the exact consent text; emails go through the outbox.
- Compliance (keep it): a comparison rate always sits next to any advertised rate, with `COMPARISON_WARNING` (`src/lib/finance.ts`); listing estimates are lender-neutral and use the all-in price (`listingEstimate`); `REFERRER_NOTE` (no credit licence, commissions disclosed) and the insurance general advice warning (`src/lib/partners.ts`); consent text (`consentText`) must list exactly what `/api/leads` sends (`FIELDS`). No ratings, "best" or recommendations of a partner.

## Phone app (`mobile/`)
- Expo SDK 57 + expo-router (`mobile/src/app`), iOS and Android from one codebase. Store steps and listing copy: `mobile/README.md`, `mobile/store/LISTING.md`.
- It imports the website's `src/lib` (search, vehicles, fees, format) through Metro `watchFolders` and the `@/lib/*` path. Keep those files free of Next/Node-only imports. Root `tsconfig.json` and `eslint.config.mjs` exclude `mobile/`.
- Auth: the app sends `Authorization: Bearer <access token>`; `supabaseServer()` builds a bearer client for it and `currentUser` checks it with `getClaims(token)`. Every API route that uses `supabaseServer()` works for both. Public reads (`/api/home`, `/api/lots/[id]`, search, facets, `/api/app/config`) take no auth so they stay edge-cached.
- Push: `push_devices` table, `POST/DELETE /api/push`, trigger `notifications_push` queues 'push' outbox rows, `src/lib/push.ts` sends via Expo (100 per request). `PUSH_DISABLED=true` skips sending. New alert kinds need a `push_wanted` rule and an Android channel (`bids` or `updates`).
- Account deletion (store rule): `/api/account/delete` + `delete_account()` / `account_deletion_blockers()`; public page `/delete-account`.
- Universal links: `src/app/.well-known/*` (env `APPLE_TEAM_ID`, `ANDROID_CERT_SHA256`). App paths are listed in `mobile/app.config.ts` (APP_PATHS) and the AASA route; keep them in step with `mobile/src/lib/links.ts`.
- Forced update: settings key `app` (`min_ios`, `min_android`), served by `/api/app/config`.
- Checks: `cd mobile && npm run typecheck && npm test`; `npx expo export -p ios -p android` must bundle. The web build (`npx expo export -p web`) is what the end-to-end tests drive.

## Tests
`npm run test:db` (needs a local Postgres; see README). Run it after any change to `supabase/migrations`. `npm run test:unit` checks the search parser and finance maths (run it after changing `vehicles.ts`, `search.ts` or `finance.ts`). `tests/load/search-bench.mjs` times search at scale.
