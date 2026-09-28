# Tyrebiter: notes for Claude Code

Next.js 15 App Router + TypeScript, Supabase (Postgres, Auth, Realtime, Storage), Stripe, Twilio, Resend. Plain CSS design system in `src/app/globals.css` (bright white + "flavour" colour backdrops, Plus Jakarta Sans + Fraunces italic). Keep that look.

## Where things live
- `supabase/migrations/` – schema, RLS, and the auction engine in SQL. **Money and bidding rules live in the database**: `place_bid`, `buy_now`, `make_offer`, `close_due_lots`, `admin_accept`, `admin_decline_referral`, `price_breakdown`, `create_invoice`. Change rules there, add a new migration file, never edit applied ones.
- `src/lib/fees.ts` mirrors `price_breakdown()` for the live preview. Keep them in step.
- `src/lib/charges.ts` – off-session Stripe charge when an invoice is created.
- `src/app/api/cron/process` – every-minute clock.
- `src/content/legal.ts` – Terms, Help and Privacy copy (draft, needs legal review).
- Admin UI: `src/app/admin`, vehicle editor `src/components/LotEditor.tsx` (writes directly with the browser Supabase client; RLS allows admins).

## Rules
- Private data (reserve, leader's max, seller details) is in `lot_private`, admin-only. Never expose it in public queries.
- Members can't change verification/payment/role fields on `profiles` (trigger `protect_profile`). Server routes use the service-role client for those.
- Test mode: `NEXT_PUBLIC_TEST_MODE=true` fakes SMS (code 123456), card, ID and charges.

## Tests
`npm run test:db` (needs a local Postgres; see README). Run it after any change to `supabase/migrations`.
