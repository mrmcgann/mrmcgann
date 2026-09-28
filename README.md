# Tyrebiter

Online auctions for cars, utes and trucks, sold on behalf of their owners across Australia.

Built with **Next.js** (the website), **Supabase** (database, logins, live bid updates, photo storage), **Stripe** (saved cards, automatic charging, ID checks), **Twilio** (SMS codes and alerts) and **Resend** (email). Hosted on **Vercel**.

---

## What's in it

**For buyers**
- Browse and search live auctions, collections and filters
- Lot pages with gallery, visual grade, flaws, "What we know", live countdown and live bid updates
- Auto-bidding with private maximums, bid increments, ties go to the earlier maximum
- Going, going, gone: bids in the last 10 minutes add 10 minutes
- Reserve met / not met, referral to the seller, Make an Offer, Buy Now
- All-in price preview as you type (premium, GST, admin fee, card surcharge)
- 5-step sign-up: account → details → SMS code → card on file → ID check
- Automatic payment when you win: under $5,000 charged in full, otherwise a non-refundable deposit plus bank transfer
- Declined-card "Pay now" flow, invoices, nominate a collector
- Watchlist with 1-hour reminders, saved searches with alerts, notification settings
- Inspection booking at the seller's location, delivery quote request, report a concern
- Sell page with appraisal form and photo upload
- Help centre, Terms of sale, Privacy policy

**For you (admin at /admin)**
- Dashboard of everything that needs attention
- List a vehicle: details, story, condition report, photos, flaws, reserve, Buy Now, timing, private seller details
- Referrals and offers: record the seller's decision (accepting charges the buyer straight away)
- Invoices: retry cards, mark balances received, mark collected, cancel with fee
- Inspections: confirm a time (buyer gets the address by SMS)
- Appraisals: see photos, update status, turn into a draft listing
- Members: suspend, mark ID verified, make admin
- Reports, and fees & auction rules

**The auction clock** (`/api/cron/process`, every minute) closes auctions, creates invoices, charges winners, and queues referral, offer, reminder, saved-search, collection and payout alerts. **The sender** (`/api/cron/send`, every minute) works through the message queue at Twilio's and Resend's safe speeds, payment and outbid alerts first.

**Selling**: every seller signs a Seller Agency Agreement online (ID check, written answers about the vehicle, ownership papers, bank details). A vehicle can't go live until that's done and the VIN and PPSR search are recorded. Sellers get a dashboard to accept or decline referred bids and offers, get texted at every step, hand over the keys only for the buyer's release code, and are paid once the buyer has collected and the claim window has closed.

**Built for scale** (tested with 1,000,000 accounts: see `tests/load` and "Stress test" below): public pages are cached and shared between visitors, live prices go out by Supabase Realtime *Broadcast* (one message fanned out to every viewer) with an edge-cached fallback, bids are one database call, alerts go through a queue, and payments can't double-charge.

---

## Test mode

With `NEXT_PUBLIC_TEST_MODE=true` the site runs without Stripe or Twilio: the SMS code is always `123456`, the card step adds a test card, the ID step passes, and card charges are marked paid. A yellow bar at the top says so. **Turn it off before launch.**

---

## Setting it up (about an hour)

### 1. Supabase (database and logins)
1. Create a project at supabase.com. Choose the Sydney region.
2. Open **SQL Editor** and run these files in order, pasting each one in:
   1. `supabase/migrations/20260928000001_init.sql`
   2. `supabase/migrations/20260928000002_storage_and_sync.sql`
   3. `supabase/migrations/20260928000003_quotes_and_payouts.sql`
   4. `supabase/migrations/20260928000004_scale.sql`
   5. `supabase/migrations/20260928000005_launch.sql`
   6. `supabase/seed.sql` (optional sample vehicles; delete them before launch)
   (Or, with the Supabase CLI: `supabase db push`.)
3. **Authentication → Sign In / Providers → Email**: leave **Confirm email** on. Every new member confirms their email with a 6-digit code before they can do anything else.
4. **Authentication → Emails → Templates → Confirm signup**: replace the body with:
   ```html
   <h2>Your Tyrebiter code: {{ .Token }}</h2>
   <p>Enter this code on the sign-up page, or <a href="{{ .ConfirmationURL }}">tap here to confirm</a>.</p>
   ```
   Do the same for **Magic Link** (used when someone asks for a new code).
5. **Authentication → Emails → SMTP Settings**: turn on custom SMTP so emails actually arrive (Supabase's built-in mailer only sends a few an hour). With Resend: host `smtp.resend.com`, port `465`, username `resend`, password = your Resend API key, sender `hello@tyrebiter.com.au`.
6. **Authentication → URL Configuration**: set Site URL to your site address (e.g. `https://tyrebiter.com.au`) and add `https://tyrebiter.com.au/auth/callback` to Redirect URLs. Add your Vercel preview address too.
7. **Project Settings → API**: copy the Project URL, the `anon` key and the `service_role` key.
8. **Project Settings → JWT Keys**: make sure the project uses the new asymmetric signing keys (new projects do by default; older ones: "Migrate JWT secret", then rotate). This lets the site check who's signed in without calling Supabase on every page.
9. **Realtime → Settings**: leave **Allow public access** on (live prices use public Broadcast channels named `lot:<id>`; they carry only what's already on the page).
10. **Authentication → Rate Limits**: raise "emails sent" (custom SMTP starts at 30 an hour), sign-ups/sign-ins and token refreshes to suit launch traffic. Tell Supabase support 2 weeks before a big launch.

#### Plan and size for 1,000,000 accounts / 10,000 people online
- **Pro plan with the spend cap turned off.** With the cap on, Realtime stops at 500 live connections and 100,000 monthly active users. Off, it allows 10,000 connections (about US$10 per extra 1,000 at peak) and bills MAU above 100,000 at US$0.00325 each.
- **Compute**: start on **Medium**; move to **Large or XL** before your first big marketing push. Supabase doesn't resize automatically and a resize is a restart of about 2 minutes, so do it at a quiet time, not during an auction close. The site is built so the database mostly serves bids and signed-in pages (public pages are cached), which is why a modest size copes.
- **Point-in-time recovery** (backups to the minute) is worth turning on once real money is flowing.

### 2. Vercel (hosting)
1. Import this GitHub repository at vercel.com/new.
2. Add the environment variables from `.env.example` (Settings → Environment Variables). Make up a long random `CRON_SECRET`.
3. Deploy, then point `tyrebiter.com.au` at it under Settings → Domains.
4. The auction clock and sender need a job every minute. Vercel **Pro** runs `vercel.json` automatically (the free plan only allows daily jobs). As a backup you can also run `supabase/cron.sql` in Supabase (put your site address and `CRON_SECRET` in it first); running both is safe.
5. **Settings → Functions**: set the region to **Sydney (syd1)**, next to your Supabase database. Leave Fluid compute on.
6. **Firewall → Rate limiting** (Pro includes 40 rules): add rules for `/api/verify/send` (e.g. 10 per IP per 10 minutes), `/api/bid` (e.g. 120 per IP per minute) and `/api/*` generally (e.g. 600 per IP per minute). The site also has its own limits on SMS codes, questions, reports and forms.
7. Extra environment variables: `LINK_SECRET` (another long random string, for unsubscribe links), `NEXT_PUBLIC_ABN`, `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_BUSINESS_ADDRESS`, `NEXT_PUBLIC_DEALER_LICENCE`, and `NEXT_PUBLIC_PAYID` if you take PayID.

### 3. Make yourself an admin
Sign up on the site, then in the Supabase SQL Editor run:
```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

### 4. Stripe (cards and ID checks)
1. Create an account at stripe.com and complete business verification.
2. Copy the secret and publishable keys into Vercel.
3. Turn on **Stripe Identity** (Dashboard → Identity) and check it's available for your Australian account.
4. Add a webhook (Developers → Webhooks) to `https://YOUR-SITE/api/stripe/webhook` with these events: `identity.verification_session.verified`, `identity.verification_session.requires_input`, `identity.verification_session.canceled`, `payment_intent.succeeded`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

### 5. Twilio (SMS)
1. Create an account at twilio.com.
2. Create a **Verify** service and copy its SID into `TWILIO_VERIFY_SERVICE_SID`.
3. Register your sender ID "Tyrebiter" on the **ACMA SMS Sender ID Register** (mandatory since 1 July 2026; unregistered brand names show as "Unverified"). Then create a **Messaging Service** with it and put its SID in `TWILIO_MESSAGING_SERVICE_SID` (or a number in `TWILIO_FROM_NUMBER`).
4. **Messaging → Settings → Geo permissions**: allow Australia only. Keep **Fraud Guard** on in Verify. This stops SMS pumping fraud.
5. Throughput is about 10 texts a second per sender. Ask Twilio to raise it before launch if you expect big watchlists; payment and outbid texts always go first, and "ending soon" texts that can't go out in time are skipped rather than sent late.

### 6. Resend (email)
Create an account at resend.com, verify `tyrebiter.com.au` (add the SPF, DKIM and DMARC records it gives you, so emails don't land in spam), and add the API key. Resend allows 10 requests a second with up to 100 emails each; the site sends in batches. For around 1 million emails a month you'll need the Scale plan.

### 7. Stripe limits
Stripe allows about 25 new payments a second. The site charges 10 at a time and retries safely (each charge has an idempotency key, so a retry can never charge twice). Before a very large sale, ask Stripe support to raise your limit (they want about 6 weeks' notice).

---

## How sign-up verification works
1. **Email**: a 6-digit code (or link) confirms the email address.
2. **Details**: legal name, date of birth (18+), address and Australian mobile.
3. **Mobile**: a 6-digit SMS code via Twilio Verify.
4. **Card**: saved securely with Stripe (handles 3-D Secure). Nothing is charged until they win.
5. **ID**: Stripe Identity, in the browser, no app needed. On a phone it opens the camera for a photo of their licence or passport and a selfie. On a computer it shows a QR code to finish on their phone, and the computer moves on by itself. The name and date of birth on the document must match their details.

## Test it after your first deploy (test mode)
- [ ] Join with a real email address: the 6-digit email code arrives and works
- [ ] Add details, then SMS code `123456`, test card, test ID
- [ ] As admin, list a vehicle ending in 15 minutes with a reserve, and publish it
- [ ] From a second account, bid below the reserve; from the first, outbid them (the second gets an outbid email)
- [ ] Bid in the last 10 minutes: the clock jumps back to 10 minutes on both screens
- [ ] Let it end: the winner's invoice appears, marked paid (test mode), and the win email arrives
- [ ] Repeat with a bid below the reserve: it shows "Referred to the seller"; decline it in Admin → Referrals & offers, make an offer, accept it
- [ ] Buy Now on a vehicle over $5,000: $500 deposit, balance shown with bank details
- [ ] Book an inspection, confirm it in admin: the buyer gets the address by SMS/email
- [ ] Request an appraisal on the Sell page with photos: it appears in Admin → Appraisals
- [ ] Seller flow: in Admin, turn the appraisal into a draft listing, copy the seller link (or "Text + email it"), open it signed in as a third account, verify ID, answer the questions, upload a photo as the rego papers, add bank details, sign
- [ ] Try to publish before ticking "Papers match" and adding the VIN + PPSR date: it refuses and says why. Then publish
- [ ] Sign in as the seller and try to bid on your own vehicle: refused
- [ ] End it below the reserve: the seller gets a text, accepts in their dashboard, the buyer is charged and gets the tax invoice PDF by email
- [ ] Buyer books a collection; confirm it in Admin → Collections; the buyer sees the address and release code, the seller gets the handover link; enter the code on the handover page
- [ ] Lodge a claim from the invoice: the payout goes on hold; reject it: the payout goes back
- [ ] Wind the claim window back (or wait 2 business days): the payout shows Ready; confirm the bank details by phone and mark it paid; the seller gets the statement
- [ ] Ask a question on a lot; answer and publish it in Admin → Questions
- [ ] Click "Manage alerts" in an email: settings open without signing in; unsubscribe works

Then add the Stripe keys (test keys first: card `4242 4242 4242 4242`, and `4000 0000 0000 9995` to test a declined charge) and Twilio, and repeat.

## Automated tests
`npm run test:db` runs 138 checks of the auction engine, payment maths, seller agreement, publish checks, collection codes, claims, payouts, the message queue and every security rule against a real Postgres database (set `PGHOST`/`PGPORT` to a local Postgres you can create databases on).

## Stress test
`tests/load` builds a full-size copy of the database (1,000,000 accounts, 60,000 vehicles, 1.1M bids, 3M watchlist rows, 3M notifications) and hammers it:
```bash
PGPORT=55432 node tests/load/build.mjs     # build the 1M-account database (~5 min)
PGPORT=55432 node tests/load/bench.mjs now # time every query the site makes
PGPORT=55432 node tests/load/storm.mjs     # sale day, last-second snipe, 2,000 closes at once, alerts, queue, sign-up rush
```
`tests/load/mock-supabase.mjs` + `tests/load/web.mjs` load-test the website itself. Results from the last run are in `tests/load/results/` and summarised in `tests/load/RESULTS.md`.

## Before launch
- [ ] `NEXT_PUBLIC_TEST_MODE=false`
- [ ] Real fees (including the seller fee) in **Admin → Fees & settings**. The Terms, Help and Seller agreement pick the numbers up automatically. Fill the remaining `[brackets]` in `src/content/legal.ts` (licence details, governing state, trust account)
- [ ] **Admin → Fees & settings → Selling checks** is ON
- [ ] Public holidays for next year added to the `public_holidays` table (the business-day maths skips them)
- [ ] Terms of sale, Seller agency agreement and Privacy policy reviewed by an Australian lawyer: consumer-law wording for auction vs Buy Now/offer sales and business sellers, state safety-certificate and registration rules, motor dealer and auctioneer licensing in each state, whether sale proceeds must sit in a trust account, unfair contract terms (deposit forfeiture, withdrawal and cancellation fees), storage and abandonment
- [ ] Accountant to confirm GST handling when a GST-registered seller sells through you as agent
- [ ] ABN, licence number, phone, email and bank details in the environment variables and footer
- [ ] Sample vehicles deleted
- [ ] A full test sale with a real card, then refunded in Stripe

## Running it on your computer
```bash
npm install
cp .env.example .env.local   # fill in your Supabase keys
npm run dev
```
