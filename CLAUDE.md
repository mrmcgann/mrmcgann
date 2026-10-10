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

## Listing accuracy and consumer law (keep it)
- `lot_publish_check` needs every check in `listing_check_keys()` (mirrored by `LISTING_CHECKS` in `src/lib/listing.ts`) in `lots.verified`, `lots.runs`, a write-off result, and never a registered statutory write-off. Who checked: `lot_private.checked_by`.
- Trigger `lot_corrections_log` (before update on lots, live/referred/offers only): logs key-fact changes to `lot_corrections` (public), alerts bidders and watchers, keeps 24 hours of bidding. Add new key facts to both its field list and its WHEN clause. Seed edits run with it disabled.
- `lots.seller_type` ('private'/'business', trigger `lot_a_seller_type` from GST status or the seller's `disclosures.business`) drives the rights wording and the `seller` search filter.
- Consumer-rights wording only from `consumerRights()` / `rightsLine()` in `src/lib/listing.ts`. Never write "no warranty". Every price shows the all-in amount beside it (`priceBreakdown`), including `LotCard` (pass `fees`).
- `admin_remove_bidder` recalculates the price as if the bidder never bid; `admin_relist` copies to a new draft (PPSR and checks redone); `admin_offer_next_bidder` / `respond_second_chance` (page `/offers/[id]`).
- Fleet sales: `sales`, `lots.sale_id`, `sale_stats`, `admin_stagger_sale`, search filter `sale`. Bulk upload: `src/lib/importLots.ts` + `/api/admin/import` (drafts only). CSV via `src/lib/csv.ts` (formula-safe).
- Partner kinds now include `transport` and `warranty` (same consent and referrer rules; warranty shows the general advice warning and says buyers don't need one for their consumer guarantees).
- Newsletter: `src/lib/newsletter.ts` (weekly, from the clock) → `queue_newsletter()` only to members with `notify.marketing.email`. Kind `marketing` always gets the unsubscribe link and header.
- Licences: settings key `business.licences`, shown in `Footer` and the Terms (`{{LICENCES}}`).

## Terms, payment and liability (keep them true to the engine)
- Copy in `src/content/legal.ts` (TERMS 20 sections, SELLER_AGREEMENT, WEBSITE_TERMS, HELP); `tests/unit/legal.test.mjs` checks numbering, tokens and the key protections. If you change a rule in the engine, change the wording, and the reverse. New version: bump `TERMS_VERSION_LABEL` and settings `terms.buyer_version` (members re-accept before bidding).
- Migration `20261010000013_terms_engine.sql`: fees locked per vehicle (`lots.fees`, `lot_price_breakdown()`; TS `lotFees()` for every all-in price), seller fee from `seller_agreements.fees`, `collect_by` only set when the transfer completes, `invoices.failed_at/refunded_amount/refund_note/cancel_reason/terms_version`, `seller_payouts.kind` ('forfeit' = seller's half of a kept deposit/fee), trigger `bid_extends_auction`, trigger `reserve_locked`, corrections cover title/description/location/plate, flaws via `lot_flaw_changes` + `announce_flaw_changes()` (clock).
- Admin actions: `cancel-invoice` (buyer default: waits 1 business day after the decline or the overdue reminder), `refund-cancel` (not the buyer's fault: refunds everything). Never write "non-refundable" for the deposit.

## The information machine (metrics, insights, SEO)
- Traffic: `src/components/Tracker.tsx` (web) and `mobile/src/lib/track.ts` (app) → `POST /api/t` → `web_events` (server only; no cookies, no IPs, daily visitor hash, bots/DNT skipped, admin pages not tracked). Pure helpers in `src/lib/traffic.ts`. First-touch source per member: `member_attribution`.
- Metric store: `metric_values (day, metric, dim, value)` filled by `compute_daily_metrics(day)` / `refresh_metrics(n)` (migration `20261010000014_insights.sql`). Dims are `cat:`, `state:`, `src:`, `dev:`, `page:`, `region:`, `via:`, `kind:`, `q:`. Stock levels (`metric_is_snapshot`) only for today. A new metric: add it to `compute_daily_metrics` and, if it's a KPI, to `KPIS` in `src/lib/metrics.ts` (pure, unit-tested).
- Insights: `src/lib/insights.ts` (`runInsights`, `sendBriefing`, optional `aiSummary` via ANTHROPIC_API_KEY, totals only) → table `insights`; briefings are notify kind `insights` (email only; `push_wanted` off unless chosen). Pages `/admin/insights`, `/admin/seo`; charts in `src/components/admin/Charts.tsx`.
- SEO: copy and JSON-LD in `src/lib/seo.ts` (never the VIN; offer price is the all-in amount); checks in `src/lib/seoChecks.ts`; runner `src/lib/seoEngine.ts` (nightly audit → `seo_issues`, IndexNow ping, Search Console sync → `seo_search_daily`). Make/model pages `/makes/[make]/[model]` index only with live stock or 3+ sales; the sitemap uses the same rule.

## Sell page and vehicle lookups (our own, free)
- `/api/rego-lookup` takes plate+state and/or a VIN. Australian sources only. Default engine `freeLookup` in `src/lib/vinDecode.ts`: `plate_memory()` (plates we've listed), `vin_pattern()` (table `vin_patterns`, learned by trigger `learn_vin_pattern` from published listings only), then `src/lib/vin.ts` (maker/country from the first characters, model-year character). No overseas data sources. Never scrape the states' rego checks (their terms forbid it). A paid provider (`src/lib/regoLookup.ts`) is optional and off by default.
- `src/lib/rego.ts` (shared: tidy names, category from body/model, `publicVehicle` strips the full VIN and engine number). Results are cached in `rego_lookups` (server only, pruned after 90 days); `/api/appraisals` copies the full lookup by `lookupId`.

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
`npm run test:db` (needs a local Postgres; see README). Run it after any change to `supabase/migrations`. `npm run test:unit` checks the search parser, finance maths, lookup tidying, VIN decoder, listing wording, bulk upload, CSV, the legal copy and the information machine (run it after changing `vehicles.ts`, `search.ts`, `finance.ts`, `rego.ts`, `vin.ts`, `listing.ts`, `importLots.ts`, `csv.ts`, `legal.ts`, `traffic.ts`, `metrics.ts`, `seo.ts` or `seoChecks.ts`). `tests/load/search-bench.mjs` times search at scale.
