# Tyrebiter

Online auctions for cars, utes, trucks, motorbikes, caravans, boats and machinery across Australia.

Built with **Next.js** (the website), **Supabase** (database, logins, live bid updates, photo storage), **Stripe** (ID checks), **PayID and bank transfer** into your trust account for every dollar (optionally Azupay for single-use PayIDs), **Twilio** (SMS codes and alerts) and **Resend** (email). Hosted on **Vercel**.

---

## What's in it

**For buyers**
- Browse and search live auctions, collections and filters
- Lot pages with a big photo and four smaller ones, a full-screen viewer, up to 10 photos and videos (one walkaround video, shown second), registered or unregistered (plate, state and expiry, like Grays), visual grade, damage and wear, checks, live countdown and live bid updates
- Bid history with every bidder's name blurred (a made-up name per bidder per vehicle; real names never leave the database)
- Auto-bidding with private maximums, bid increments, ties go to the earlier maximum
- Going, going, gone: bids in the last 10 minutes add 10 minutes
- Reserve met / not met, referral to the seller, Make an Offer, Buy Now
- All-in price beside every price (listing cards, the current bid, Buy Now, offers, the newsletter) and a preview as you type (premium, GST, admin fee; no surcharge)
- Listings checked against the vehicle before they go live (VIN plate, build date, odometer photo, transmission, fuel, features, warning lights, starts and drives, damage photos), shown as "Checked against the vehicle"; private or business seller on every listing; "Starts and drives" filter; EV battery health; plain consumer-rights wording for auction and Buy Now sales (`/listing-promise`, `src/lib/listing.ts`)
- Corrections in public: any later change to a key fact is shown under "Changes to this listing", sent to bidders and watchers, and bidding gets at least 24 more hours
- Fleet sales (`/sales`): one seller's vehicles on one page, closing a few minutes apart
- Offer to the next bidder when a winner doesn't pay (`/offers/[id]`, no obligation, all-in price shown)
- Landing pages for search engines (`/for-sale/utes`, `/for-sale/utes/qld`): real listings and recent results only, not indexed when empty
- Recently viewed and "For you" (your saved search) on the home page, private notes on watched vehicles, help centre search, and on the Sell page what similar vehicles sold for here (only with 3 or more sales)
- Transport quotes from a carrier partner (listing and invoice), carrier tracking link on the collection, and warranty and roadside assistance providers (`/warranty`)
- Weekly newsletter for members who opt in (one-click unsubscribe)
- Sign-up: account → details → SMS code → ID check (licence or passport and a selfie). That's all it takes to bid: no deposit and no card
- **No cards, so no chargebacks.** The default works like Turners: anyone with a verified mobile and ID can bid (so buyers waiting on finance can bid too), and the winner pays the full amount by PayID or bank transfer within 2 business days (their lender can pay us directly). Nothing is released until it has cleared
- **A buyer who doesn't pay is banned.** Cancelling for non-payment closes their account for bidding, takes their bids off other live auctions, and keeps a one-way code of their name and date of birth, mobile and email, so the same person is suspended as soon as a new account passes the ID check
- Optional bidding deposit (switch in **Fees & settings**, like Copart and Manheim): a refundable deposit by PayID or bank transfer before bidding, 10% of the most they want to bid, at least $500, $5,000 means no limit. One deposit covers every vehicle they're winning; the deposit for the price goes onto the invoice; not paying loses it (half to the seller). Its page (`/account/deposit`, app too) shows the "paddle" with their limit, what's holding it, topping up and withdrawing
- Invoices, nominate a collector
- Watchlist (`/watchlist`): the vehicle closing next up top with a big countdown, an outbid strip with "Bid again", tabs (all, ending today, winning, outbid, won, didn't win), sort, prices that update live, the all-in price beside every bid, bid straight from the list (same confirm step as the vehicle page), private notes, 1-hour reminders, compare up to three side by side, remove with Undo, and finished vehicles kept with their result; saved searches with alerts; notification settings
- No viewings: vehicles stay with their owners and buyers never visit. Each listing shows how to check it instead (our condition report, the photos and damage map, the seller's walkaround video, a mechanical inspection from our partner mechanic at the buyer's cost, or ask us). Buyers never learn who or where the seller is
- Transport to our depot in the buyer's premium: a per-vehicle amount set before bidding opens and part of every all-in price. After payment our transport partner picks the vehicle up and takes it to the depot named on the listing; the buyer collects it there with a release code
- Finance and insurance comparison (`/finance`, `/insurance`), with a repayment estimate on every listing; enquiries go to partners only with the member's permission
- Delivery quote request, report a concern
- Sell page (`/sell`): one form, about 10 minutes. Pick the type (car, ute, truck, trailer, bus, motorbike, caravan, boat, machinery), type the plate (any state) or VIN and our own free lookup fills in the vehicle; kilometres or hours, condition, the yes/no questions buyers see, guided photos laid out exactly like the listing (one big photo with four beside it, the front corner as the cover; up to 10, shrunk on the phone before they upload), no reserve or a reserve amount, contact details, then the Seller Agency Agreement to read to the end, tick and sign with a finger (or a typed name). We keep a PDF of what was signed, email the seller a copy, text them, and tell our team. A half-filled form survives a reload
- Transfer of ownership between payment and collection: registered vehicles are transferred into the buyer's name (seller lodges their part, buyer uploads the confirmation, we check it); unregistered vehicles get a certificate of sale and the buyer says how they'll move it. The depot's address comes with a confirmed collection time; the seller's address never goes to a buyer
- Help centre, Terms of sale, Website terms, Seller agency agreement, Privacy policy

**For you (admin at /admin)**
- Dashboard of everything that needs attention
- List a vehicle: details, story, condition report, photos, flaws, reserve, Buy Now, timing, private seller details
- Referrals and offers: record the seller's decision (accepting charges the buyer straight away)
- Members: **Ban** (with a reason they see) or suspend; lifting it also forgets the identity codes
- Deposits (`/admin/deposits`, shown when deposits are on): record a transfer that arrived (it checks the payer's name matches the member), send refunds to the account they came from, correct a balance; totals of what you hold
- Invoices: mark balances received, mark collected, cancel for non-payment (bans the buyer, keeps any deposit) or cancel and refund
- Videos: add the listing's video yourself in the vehicle editor (it goes live straight away), or approve or reject the seller's
- Rego & VIN check: type a plate and state or a VIN; shows what we know, with one-click links to the state's free rego check and the PPSR
- Listing checks in the vehicle editor (all needed to publish; who checked is recorded), seller type, EV battery health, and the sale a vehicle belongs to
- Bidders on a live vehicle, with "Remove their bids" (bid before a material correction and asked out, or shill bidding; the price is worked out again)
- Didn't sell: relist as a new draft (past bidders and watchers hear when it's back), or offer it to the next bidder
- Fleet sales: create a sale page, stagger closing times, end-of-sale report (CSV); Bulk upload a fleet list (CSV) into drafts
- Listing audits: a sample of live listings to re-check each month, with a record (part of the consumer law compliance program)
- Newsletter: preview, send now, or weekly on a set day and hour; Licences shown in the footer and Terms (Fees & settings)
- Transfers: check each buyer's transfer confirmation, chase the seller's part, complete it (the buyer can then book collection)
- Partners and leads: lenders, brokers, insurers and inspection companies, their clicks and enquiries, and the fee each one paid (CSV export)
- Consultants: the named contact shown on each listing
- Appraisals: see photos, the signed sell form (reserve, condition, every answer that needs a look, the signature and the signed PDF), update status, turn into a draft listing (the answers, reserve and any finance owing go across)
- Members: suspend, mark ID verified, make admin
- Reports, and fees & auction rules

**The auction clock** (`/api/cron/process`, every minute) closes auctions, creates invoices, charges winners, and queues referral, offer, reminder, saved-search, collection and payout alerts. **The sender** (`/api/cron/send`, every minute) works through the message queue at Twilio's and Resend's safe speeds, payment and outbid alerts first.

**Selling**: every seller signs a Seller Agency Agreement online (ID check, written answers about the vehicle, ownership papers, bank details). A vehicle can't go live until that's done and the VIN and PPSR search are recorded. Sellers get a dashboard to accept or decline referred bids and offers, get texted at every step, hand the vehicle only to our transport partner's driver once the buyer has paid (the driver quotes a TR- booking reference), and are paid once the buyer has collected it from our depot and the claim window has closed. Buyers never visit and never get the seller's details.

**Built for scale** (tested with 1,000,000 accounts: see `tests/load` and "Stress test" below): public pages are cached and shared between visitors, live prices go out by Supabase Realtime *Broadcast* (one message fanned out to every viewer) with an edge-cached fallback, bids are one database call, alerts go through a queue, and payments can't double-charge.

---

## Test mode

With `NEXT_PUBLIC_TEST_MODE=true` the site runs without Stripe or Twilio: the SMS code is always `123456`, the ID step passes, and the deposit step has a "pretend it arrived" button. A yellow bar at the top says so. **Turn it off before launch.**

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
   6. `supabase/migrations/20261003000006_search.sql`
   7. `supabase/migrations/20261003000007_app.sql` (phone apps: push notifications, account deletion)
   8. `supabase/migrations/20261003000008_media_partners.sql` (listing videos, blurred bidder names, consultants, finance/insurance/inspection partners and enquiries)
   9. `supabase/migrations/20261004000009_rego_transfer.sql` (registered/unregistered on every listing, one video inside 10 photos and videos, plate lookups, transfer of ownership before collection)
   10. `supabase/migrations/20261004000010_free_lookup.sql` (our own free plate and VIN lookup)
   11. `supabase/migrations/20261004000011_lookup_australia_only.sql` (keeps the lookup to Australian sources)
   12. `supabase/migrations/20261004000012_accuracy_fleet_partners.sql` (listing checks, public corrections, seller type, fleet sales, relisting, offers to the next bidder, transport and warranty partners, listing audits, newsletter)
   13. `supabase/migrations/20261010000013_terms_engine.sql` (fees locked per vehicle, payment terms and cancellations as the Terms describe them)
   14. `supabase/migrations/20261010000014_insights.sql` (traffic, the daily metrics and insights)
   15. `supabase/migrations/20261011000015_health.sql` (site health, errors and fixes)
   16. `supabase/migrations/20261011000016_sell_form.sql` (the signed sell form: reserve, answers, signature and PDF; photos only into the sellers' photo bucket)
   17. `supabase/migrations/20261012000017_bidding_deposits.sql` (pay by PayID or bank transfer, bans for non-payers, optional bidding deposits)
   18. `supabase/migrations/20261012000018_security.sql` (two-step sign-in for admins, the admin log, new-admin alerts, internal settings and privileged functions closed to the public)
   19. `supabase/migrations/20261012000019_viewings_dealers.sql` (inspected listings, dealer accounts, price-drop alerts, review requests)
   20. `supabase/migrations/20261021000020_live_tender_bpay.sql` (live auctions, tenders, BPAY, the damage map, the auction calendar)
   21. `supabase/migrations/20261022000021_depot_collection.sql` (no viewings, depots, transport in the buyer's premium, pickups after payment, collection at the depot, the seller kept private)
   22. `supabase/seed.sql` (optional sample vehicles, sample depots, a sample consultant and sample partners; delete them before launch)
   23. Optional: `supabase/sample-photos.sql`, made by `npm run sample-photos` (see "Sample photos" below)
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
10. **Storage → Settings**: raise the upload file size limit to **250 MB** (needs the Pro plan; the free plan stops at 50 MB). Listing videos use it. Ask sellers for MP4 (H.264) from a phone in landscape; 1 to 3 minutes is plenty.
11. **Authentication → Multi-Factor**: make sure **TOTP (App Authenticator)** is enabled (it is by default). Admins need it: see "Security" below.
12. **Authentication → Attack Protection**: turn on **Prevent use of leaked passwords** and set the minimum password length to **10**. Leave **CAPTCHA protection** off: the sign-in forms don't show a CAPTCHA, so turning it on would stop everyone signing in. Under **Sessions**, a JWT expiry of 1 hour (the default) is right.
13. **Authentication → Rate Limits**: raise "emails sent" (custom SMTP starts at 30 an hour), sign-ups/sign-ins and token refreshes to suit launch traffic. Tell Supabase support 2 weeks before a big launch.

#### Plan and size for 1,000,000 accounts / 10,000 people online
- **Pro plan with the spend cap turned off.** With the cap on, Realtime stops at 500 live connections and 100,000 monthly active users. Off, it allows 10,000 connections (about US$10 per extra 1,000 at peak) and bills MAU above 100,000 at US$0.00325 each.
- **Compute**: start on **Medium**; move to **Large or XL** before your first big marketing push. Supabase doesn't resize automatically and a resize is a restart of about 2 minutes, so do it at a quiet time, not during an auction close. The site is built so the database mostly serves bids and signed-in pages (public pages are cached), which is why a modest size copes.
- **Point-in-time recovery** (backups to the minute) is worth turning on once real money is flowing.

### 2. Vercel (hosting)
1. Import this GitHub repository at vercel.com/new.
2. Add the environment variables from `.env.example` (Settings → Environment Variables). Make up a long random `CRON_SECRET` (at least 32 characters: a password manager's generator is ideal, or `openssl rand -hex 32`).
3. Deploy, then point `tyrebiter.com.au` at it under Settings → Domains.
4. The auction clock and sender need a job every minute. Vercel **Pro** runs `vercel.json` automatically (the free plan only allows daily jobs). As a backup you can also run `supabase/cron.sql` in Supabase (put your site address and `CRON_SECRET` in it first); running both is safe. The secret travels in a header, never in the address, so it doesn't end up in logs.
5. **Settings → Functions**: set the region to **Sydney (syd1)**, next to your Supabase database. Leave Fluid compute on.
6. **Firewall → Rate limiting** (Pro includes 40 rules): add rules for `/api/verify/send` (e.g. 10 per IP per 10 minutes), `/api/bid` (e.g. 120 per IP per minute) and `/api/*` generally (e.g. 600 per IP per minute). The site also has its own limits on SMS codes, questions, reports and forms.
7. Extra environment variables: `LINK_SECRET` (another long random string, for unsubscribe links), `NEXT_PUBLIC_ABN`, `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_BUSINESS_ADDRESS`, `NEXT_PUBLIC_DEALER_LICENCE`, the trust account bidders pay into (`NEXT_PUBLIC_BANK_NAME`, `NEXT_PUBLIC_BANK_BSB`, `NEXT_PUBLIC_BANK_ACCOUNT`) and `NEXT_PUBLIC_PAYID` for that account's PayID. For BPAY, ask your bank for a biller code and set `NEXT_PUBLIC_BPAY_BILLER`: every member already has their own CRN, shown with it on invoices and deposit pages.

### 3. Make yourself an admin
Sign up on the site, then in the Supabase SQL Editor run:
```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```
The first time you open **Admin**, the site asks you to set up two-step sign-in: install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or 1Password), scan the code, and type the 6 digits it shows. After that it asks for a code each time you sign in. Every admin is told whenever someone is made an admin. Lost phone: in Supabase, **Authentication → Users →** the admin **→** delete their MFA factor, and they set it up again next time.

### 4. Stripe (ID checks)
Stripe is only used for ID checks (no cards are taken). The ID check is what makes "ban the non-payers" work, so keep it on.
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

### 7. Taking money: the trust account and PayID
1. Open a trust account (or the account your lawyer says auction money must sit in) with your bank, with a PayID (an email or ABN PayID such as `pay@tyrebiter.com.au`). Put its details in the `NEXT_PUBLIC_BANK_*` and `NEXT_PUBLIC_PAYID` variables. They show on every deposit and invoice page with copy buttons and a scam warning.
2. Until you add a PayID provider, when a buyer's payment shows on the statement (their invoice number is the reference), press **Admin → Invoices → Balance received**. With bidding deposits switched on, deposits are recorded in **Admin → Deposits** the same way (their BID… reference, the amount, and the payer's name, BSB and account, which is where refunds go; it asks you to check if the name doesn't match the member).
3. Optional, so deposits record themselves: an **Azupay** account (Australian, PayTo/PayID payments). Set `AZUPAY_CLIENT_ID`, `AZUPAY_SECRET_KEY` and `AZUPAY_API_URL` (their UAT address first). Bidders then get a "Get a PayID for $X" button: a single-use PayID for that exact amount that shows "Tyrebiter" before they pay, and the payment is recorded the moment Azupay tells `/api/payments/azupay`. Check the field names in `src/lib/payid.ts` against your Azupay onboarding pack before switching it on.
4. Refunds: **Admin → Deposits → Refunds to send** lists each withdrawal with the full BSB and account it came from. Pay it from your bank, then press **Mark sent** (the member is told).

---

## How sign-up verification works
1. **Email**: a 6-digit code (or link) confirms the email address.
2. **Details**: legal name, date of birth (18+), address and Australian mobile.
3. **Mobile**: a 6-digit SMS code via Twilio Verify.
4. **ID**: Stripe Identity, in the browser, no app needed. On a phone it opens the camera for a photo of their licence or passport and a selfie. On a computer it shows a QR code to finish on their phone, and the computer moves on by itself. The name and date of birth on the document must match their details.
That's all it takes to bid. (With bidding deposits switched on there's a fifth step: they choose how much they want to be able to bid and pay that deposit by PayID or bank transfer.)

## Test it after your first deploy (test mode)
- [ ] Join with a real email address: the 6-digit email code arrives and works
- [ ] Add details, then SMS code `123456`, then test ID: you can bid straight away
- [ ] On the Sell page, type a plate you've listed (it fills in from our records), then a VIN you haven't (it fills in the maker and year)
- [ ] As admin, list a vehicle ending in 15 minutes with a reserve, registered (plate, state, expiry), and publish it; add a video in the editor and see it second in the gallery
- [ ] From a second account, bid below the reserve; from the first, outbid them (the second gets an outbid email)
- [ ] Bid in the last 10 minutes: the clock jumps back to 10 minutes on both screens
- [ ] Let it end: the winner's invoice shows the full amount with the bank details and reference; mark it received in Admin → Invoices
- [ ] Win another one and don't pay: wind its due date back, **Cancel: buyer didn't pay**. The buyer is banned, and a new account with the same name and date of birth is suspended as soon as its ID check passes
- [ ] Repeat with a bid below the reserve: it shows "Referred to the seller"; decline it in Admin → Referrals & offers, make an offer, accept it
- [ ] Buy Now on a vehicle: the invoice shows the full amount with the bank details
- [ ] As a fully verified member, order a mobile inspection on a listing: you get a reference, emails go to the partner, the buyer and your team, and it shows in Admin → Leads
- [ ] On a listing, open "Compare car loans" and send an enquiry to a lender; record a fee against it in Admin → Leads
- [ ] As the seller, add a video from the seller dashboard; approve it in Admin → Videos; it plays on the listing
- [ ] Bid from two accounts: the bid history shows blurred names, the same blurred name for the same bidder
- [ ] On your phone, fill in the Sell page: photos from the camera roll (they sit in the big-plus-four layout), a reserve, scroll the agreement to the end, sign with your finger, send. You get a text and an email with the signed PDF; it appears in Admin → Appraisals with the signature
- [ ] Seller flow: in Admin, turn the appraisal into a draft listing (the reserve and answers come across), copy the seller link (or "Text + email it"), open it signed in as a third account, verify ID, check the answers (already filled in from the sell form), upload a photo as the rego papers, add bank details, sign in the box
- [ ] Try to publish before ticking "Papers match" and adding the VIN + PPSR date: it refuses and says why. Then publish
- [ ] Sign in as the seller and try to bid on your own vehicle: refused
- [ ] End it below the reserve: the seller gets a text, accepts in their dashboard, the buyer gets the tax invoice PDF by email with the bank details
- [ ] After payment, the buyer's invoice shows the transfer step: upload a photo as the transfer confirmation, complete it in Admin → Transfers; the seller marks their part done from their dashboard
- [ ] After payment: in Admin → Pickups send the pickup to the transport partner, book the day (the seller gets the TR- reference), mark it picked up and then at the depot. Once it's at the depot and the transfer is complete, the buyer books a time; confirm it in Admin → Collections; the buyer gets the depot's address and release code, the depot gets the handover link; enter the code on the handover page
- [ ] Mark a pickup "Something isn't in the listing": the buyer is asked on their invoice to go ahead or cancel for a full refund, and can't book a collection until they answer
- [ ] Lodge a claim from the invoice: the payout goes on hold; reject it: the payout goes back
- [ ] Wind the claim window back (or wait 2 business days): the payout shows Ready; confirm the bank details by phone and mark it paid; the seller gets the statement
- [ ] Ask a question on a lot; answer and publish it in Admin → Questions
- [ ] Click "Manage alerts" in an email: settings open without signing in; unsubscribe works

Then add the Stripe keys (test keys first) for ID checks, Twilio, and your bank details, and repeat with a real $500 transfer.

## Automated tests
`npm run test:db` runs 806 checks of the auction engine, payment maths, bidding deposits, seller agreement, publish checks, collection codes, claims, payouts, the message queue, site health and every security rule against a real Postgres database (set `PGHOST`/`PGPORT` to a local Postgres you can create databases on). `npm run test:unit` checks the search parser, the finance maths, the lookup tidying, the VIN decoder, listing and legal wording, the information machine (traffic sources, metrics maths, SEO titles, descriptions, structured data and checks) site health (error cleaning and grouping, every health rule and alert, what's sent to Claude Code and how its progress is read) the sell form (what's required, reserve or no reserve, the signature checks, and filling in the agreement page from it) bidding deposits (the 10%/$500/$5,000 rule, limits, matching a payer's name), the transport in the buyer's premium and the pickup wording, and removing the location a phone records from photos and videos. GitHub runs both, plus the type and lint checks, on every pull request (`.github/workflows/ci.yml`).

## Stress test
`tests/load` builds a full-size copy of the database (1,000,000 accounts, 60,000 vehicles, 1.1M bids, 3M watchlist rows, 3M notifications) and hammers it:
```bash
PGPORT=55432 node tests/load/build.mjs     # build the 1M-account database (~5 min)
PGPORT=55432 node tests/load/bench.mjs now # time every query the site makes
PGPORT=55432 node tests/load/storm.mjs     # sale day, last-second snipe, 2,000 closes at once, alerts, queue, sign-up rush
```
`tests/load/mock-supabase.mjs` + `tests/load/web.mjs` load-test the website itself. Results from the last run are in `tests/load/results/` and summarised in `tests/load/RESULTS.md`.

## Phone apps (iPhone and Android)
The `mobile/` folder is the Tyrebiter app for the App Store and Google Play. It uses this website's database and API, so deploy the website first. Step-by-step store setup, costs and the listing copy are in [`mobile/README.md`](mobile/README.md) and [`mobile/store/LISTING.md`](mobile/store/LISTING.md).

## Finance, insurance and inspections (partner income)
Like carsales and Trade Me, the site earns from finance, insurance and inspection partners: a fee per enquiry, per funded loan or per policy, agreed with each partner. Buyers see the partners on `/finance`, `/insurance` and every listing.
1. **Get the agreements signed first.** Each partner pays you under a written referral agreement that says what they pay and when.
2. **Credit (finance)**: you can't give credit assistance without an Australian Credit Licence. The site is set up as a *referrer* only (it passes on details with permission, says it doesn't hold a licence, and shows the commission), which is how most car marketplaces work. Ask each lender or broker to confirm you're registered with them as a referrer, and have a lawyer check the pages before you switch lenders on.
3. **Insurance**: comparing policies is a financial service. Either become an authorised representative of a licensed insurer or broker, or send buyers to a licensed comparison partner. Each insurer listed needs its PDS and TMD link.
4. **Add the partners** in **Admin → Partners**: name, licence number, rates, the comparison rate and what it's based on (the law requires both together), fees, links (`{amount}`, `{term}`, `{make}`, `{model}`, `{year}`, `{postcode}` and `{lot}` are filled in for them), privacy policy, PDS/TMD, the email that receives enquiries, and how much they pay you (shown to buyers).
5. **Consultants**: add your real consultant(s) in **Admin → Consultants**, pick one per listing in the vehicle editor, and make one the default.
6. Clicks and enquiries per partner are in **Admin → Partners**; mark each enquiry's outcome and the fee received in **Admin → Leads**, and download the CSV for invoicing partners.

## Listing accuracy and consumer law (ACCC)
In 2024 the Federal Court ordered Grays to pay $10 million for misdescribing at least 750 cars sold online (wrong year and transmission, features the cars didn't have, damage and warning lights left out). Auctions aren't exempt from the ban on misleading descriptions, so:
- **Checked before it's live.** A listing can't be published until staff tick each check against the vehicle itself (`LISTING_CHECKS` in `src/lib/listing.ts`, `listing_check_keys()` in the database), record whether it starts and drives, and record the written-off result. A statutory write-off can never be listed as registered. Buyers see what was checked (green) apart from what the seller declared (yellow).
- **Corrections in public.** Changing a key fact on a live listing logs it in `lot_corrections` (shown on the listing), tells bidders and watchers, and makes sure 24 hours of bidding remain. Staff can remove a bidder's bids if they ask out after a material correction.
- **Plain consumer rights.** No "no warranty" wording anywhere. Each listing says private or business seller, and the rights for an auction sale and for Buy Now/offers (`consumerRights()`), with `[LAWYER TO CONFIRM]` in the Terms.
- **All-in prices** beside every price; no surcharge (we don't take cards).
- **Monthly listing audits** in Admin, as a record of the compliance program.
- **Licence numbers** in the footer and Terms from Admin → Fees & settings (NSW requires the dealer licence number in every advertisement).
- **Spam Act:** marketing only to members who opt in, with our details and one-click unsubscribe in every email.

## Fleet sales, relisting and the next bidder
- **Admin → Fleet sales**: create a sale (title, web address, the seller as shown publicly, about text), publish it, add vehicles from the editor or **Bulk upload**, then stagger closing times (one every few minutes; vehicles with bids keep their time). The sale page is `/sales/<web address>`; the CSV report has every result, fee and payout.
- **Bulk upload**: download the template, one vehicle per row (make and model required), preview, then add them as drafts.
- **Didn't sell**: on the vehicle's admin page, relist it as a new draft (re-run the PPSR and the listing checks before publishing), or, when the buyer didn't pay, offer it to the next highest bidder at their highest bid (24 hours, no obligation; below the reserve only with the seller's agreement).

## Plate and VIN lookups (Sell page): our own, free, Australian only
Sellers type their plate and state, and the VIN if they have it handy; the form fills in what it can, and they check and correct it. It costs nothing to run and doesn't scrape anyone: the states' free rego checks don't allow automated use (Queensland, Victoria and WA say so in their terms, and Queensland and NSW sit behind reCAPTCHA), and full rego records are only sold through paid channels. Instead, in this order (`src/lib/vinDecode.ts`):
1. **Our records.** A plate we've listed before fills in straight away (year, make, model, variant, body, colour, fuel, VIN).
2. **What we've learned from VINs.** Every vehicle we publish, checked by our team against the papers and the PPSR, teaches the system what its VIN pattern means (`vin_patterns`), so the next vehicle with a similar VIN fills in its make and model. Members can't teach it, so nobody can feed it wrong details. It gets better with every listing.
3. **The VIN itself.** Who made it and where it was built (the first characters) and the likely model year (the 10th character).

The full VIN never goes to the browser ("VIN ending 123456"); it's saved with the seller's request for your team. Lookups are limited to 20 an hour and 60 a day per person. In the vehicle editor, **Fill in empty fields from the VIN** uses the same lookup, and **Check the rego free** opens the state's own rego check for a person to look at (allowed for manual use).

Optional, if you ever want plate-only lookups for Australian vehicles we haven't seen: a paid provider can be switched on with `REGO_LOOKUP_PROVIDER` (`carregistrationapi` or `autograb`) and `REGO_LOOKUP_KEY`. It's off unless you set them.

## The sell form and electronic signature (`/sell`)
One page, six parts, signed at the bottom (`src/app/sell/SellForm.tsx`; rules in `src/lib/sellForm.ts`, checked the same way in the browser and on the server).
- **What's asked:** type of vehicle; registered (plate, state, rego expiry if known) or unregistered; VIN; year, make, model, variant, transmission, fuel, colour; kilometres (hours for machinery and boats; nothing for trailers); overall condition; the same yes/no questions as the Seller Agency Agreement (finance owing and roughly how much, starts and drives, accident, flood, hail, modifications, taxi/hire/police use, unfixed recalls, warning lights, odometer); write-off history, keys, service books, anything else a buyer should know; photos; **no reserve** or **a reserve** in whole dollars; name, mobile, email, suburb and postcode where it's kept, who owns it, business seller or not, and when they want to sell.
- **Photos:** five guided shots (front corner as the cover, rear corner, side on, inside, the dash with the engine on; for machinery the hour meter, for trailers the plate or VIN) laid out like the listing gallery, plus extras up to 10. Each one is shrunk in the browser (long side 2048 px, JPEG) and uploaded as soon as it's picked, into the private `appraisal-photos` bucket (photos only, 12 MB each).
- **Signing:** the agreement sits in a box that has to be scrolled to the end before "I've read and agree" can be ticked; they also confirm they own it (or are authorised), draw their signature with a finger, stylus or mouse (or choose to sign with their typed name), and type their full name. The signature is kept as numbers, checked on the server (a dot or a tick isn't a signature) and drawn back as our own SVG. We record the time, IP and device, keep `submissions/<id>/signature.svg` and `agreement.pdf` (every answer, the full agreement and the signature) in the private `seller-docs` bucket, email the seller the PDF, text them that we'll call within 1 business day, and email your team the lead.
- **Then:** in **Admin → Appraisals** you see the signed form (reserve, condition, the answers that need a look, signature, PDF). **Create draft listing** carries the answers, the reserve (into the private reserve) and any finance owing (private) across. The seller still signs on their agreement page with a verified ID before anything goes live; that page is filled in from the sell form, and also takes a drawn signature.
- Form requests are limited to 6 an hour per network. The appraisal table can only be written by the server (no direct inserts through the database API).

## Transfer of ownership (between payment and collection)
When an invoice is paid in full, the buyer's invoice shows a **Transfer of ownership** step and the seller's dashboard shows theirs, with the steps and official links for the vehicle's state (`src/lib/transfer.ts`, checked October 2026; recheck each state's page before launch).
- **Registered:** the seller lodges their part (notice of disposal, or starting the transfer online); your consultant gives them the buyer's details the form needs. The buyer transfers the registration and uploads the confirmation (or enters the receipt number). Check it in **Admin → Transfers** and complete it. A buyer who can't register it in that state can choose to take it unregistered: the seller cancels the registration and keeps the plates.
- **Unregistered:** the buyer confirms the certificate of sale (a PDF from their invoice, issued by Tyrebiter as agent for the owner) and how it will be moved: carrier, trailer, or the state's unregistered vehicle permit. This completes straight away.
- Collection can only be booked once the transfer is complete and the vehicle is at our depot (and the buyer has answered any change the driver found at pickup); the collection window starts then. The buyer gets the depot's address with the confirmed time. The seller's address never goes to a buyer.
- Proof files are kept in the private `transfer-docs` storage bucket.

## Terms, payment and liability (version 22 October 2026)
Written in our own words after comparing the payment terms and site terms of Grays/Slattery, Pickles and Manheim, keeping what protects buyers, sellers and Tyrebiter and leaving out terms the unfair contract terms laws catch (termination "for any reason", 1%-a-day late fees, one-sided changes, blanket exclusions). `src/content/legal.ts`: Terms of sale (20 sections), Seller agency agreement, Website terms (`/website-terms`), Help.
- **Paying (sections 6, 8 and 11):** by default (like Turners) nothing before bidding but a verified ID; the winner pays the full amount by PayID or bank transfer within 2 business days (their lender may pay). With bidding deposits switched on, a refundable deposit first and the deposit for the price goes onto the invoice. The Terms, Help and Privacy show the wording for whichever is on (`[[transfer]]`/`[[deposit]]` in `src/content/legal.ts`); after switching, save a new terms version. No cards, cash or cheques; payments only from an account in the buyer's name (others are sent back); refunds only to the account money came from; nothing released until funds clear. Interest on overdue balances at the rate in **Fees & settings** (default 10% a year, capped at 20), no other late fees. Never "non-refundable": the deposit is kept only if the buyer doesn't pay.
- **Why deposits, not cards:** a card payment can be disputed for months (chargebacks), and a merchant-initiated charge has no fraud liability shift. A PayID or bank transfer can't be charged back: once it has cleared, the buyer can't reverse it through a dispute (a bank can only try to recall a payment for fraud or a mistake, which is why it must come from the buyer's own account). And nobody pays a surcharge. Copart and Manheim take bidding deposits the same way.
- **Not paying:** an overdue reminder (clock), then 1 business day. **Admin → Invoices → Cancel: buyer didn't pay** refuses earlier, bans the buyer (no new account for the same person), and with deposits keeps the deposit applied to that vehicle (half to the seller). No cancellation fee. The Terms keep the right to recover an actual shortfall if the vehicle resells for less.
- **Cancel and refund** (Admin → Invoices) for anything that isn't the buyer's fault (upheld claim, title problem, damage before handover, our mistake): the deposit goes straight back into the buyer's deposit, it lists any balance to pay back, and cancels the seller payout and open collection bookings. (Old card invoices are refunded in Stripe.)
- **Fees are locked per vehicle** when it goes live (`lots.fees`); a fee change applies only to vehicles listed afterwards. The seller fee comes from the copy saved when the seller signed. Each invoice records the terms version the buyer accepted.
- **Storage** only starts once the vehicle is at our depot, the registration transfer is complete and the collection window has passed.
- **No viewings, the pickup and the depot (sections 2, 4, 5, 7, 9, 14, 16 and 18; seller agreement 1, 3, 7 and 15):** no viewings or test drives; an optional mechanical inspection through our partner, paid by the bidder, who never attends or gets the address; the transport to our depot is in the buyer's premium; the seller keeps the vehicle at their risk until our partner picks it up after payment, and we're responsible for it from pickup until handover at the depot (a change found at pickup lets the buyer cancel for a full refund); buyers must never look for or contact the seller; each listing says whether a statutory warranty applies. The `[LAWYER ...]` notes mark what to confirm (selling for an unnamed seller, whether Victoria lets a private seller's vehicle be sold other than at public auction, NSW consignment and trust account rules, Queensland's buyer's premium and statutory warranty rules, transit and depot insurance, states whose transfer form shows the seller's details, GST agent arrangements).
- **Late bids:** any bid in the closing minutes extends the auction, including a leader raising their maximum to meet the reserve. The reserve can be lowered but never raised once there are bids.
- **Corrections** also cover the title, description, the depot you collect from, the statutory warranty statement, the plate and the damage list (damage edits are announced once staff stop editing for 5 minutes).
- Sellers also declare previous use (taxi, rideshare, hire, driving school, police) and unfixed safety recalls; both show on the listing.

## The information machine: Insights, SEO and the briefing email
Runs in the background off the every-minute clock; nothing to switch on except the optional Google connection.
- **Admin → Insights**: every business number in one place (sales, sell-through, bids per vehicle, revenue and take rate, visitors and where they came from, sign-ups and the funnel to a paid sale, time to pay, transfer and collect, claims, seller pipeline, searches and searches that found nothing, partner enquiries), compared with the period before, with charts and breakdowns by category, state, source, device and page. At the top, **what the numbers say**: findings with what to do (overdue balances, unanswered appraisals and questions, auctions ending with no bids, reserves above where bidding finished, the best and worst categories, demand you have no stock for, big moves week on week, SEO problems). Mark each Done or Dismiss.
- **The briefing email** to every admin: weekly (Monday 7 am by default) and optionally every morning, set at the bottom of Admin → Insights. With `ANTHROPIC_API_KEY` set, the weekly one opens with a short summary written by Claude (`INSIGHTS_AI_MODEL`, default `claude-haiku-4-5-20251001`); only business totals and search filters (such as "Toyota HiLux under $30,000") are sent to Anthropic, never anyone's details.
- **Admin → SEO**: what the nightly audit found (listings with too few photos, short descriptions, missing year/make/model; pages that are slow, broken, missing a title, description, canonical link or structured data), and once connected, what people search on Google to find you, the searches you're close to winning and titles that need rewriting.
- **On the site**: every vehicle page has a search title and description from its facts (with the all-in price), structured data (schema.org Car/Vehicle with the offer), breadcrumbs, and its photo in the sitemap; landing pages for every make and model (`/makes`) with real listings, real recent results and the price range from your own sales; filtered searches point to one main page; pages with nothing on them aren't indexed. New, changed and sold listings are sent to Bing and other IndexNow engines within 10 minutes (`/indexnow-key.txt`; set `INDEXNOW_KEY` to choose the key).
- **Traffic counting** is our own (`/api/t`): no cookies, no IP addresses kept, a visitor code that changes daily, robots and browsers asking not to be tracked are skipped, private links (unsubscribe, handover, seller agreement) never stored, searches recorded as filters only (never the words typed), raw rows deleted after 90 days. Tag links you share with `?utm_source=facebook&utm_campaign=utes` to see each campaign. New members are credited to where their first visit came from, and sales to the buyer's first source.
- **Connect Google Search Console** (free): verify the domain at search.google.com/search-console, create a Google Cloud service account with the Search Console API turned on, add its email as a user on the property, then set `GOOGLE_SERVICE_ACCOUNT` (the JSON key, or base64 of it) and `GSC_SITE` (`sc-domain:tyrebiter.com.au`) in Vercel. Submit `https://tyrebiter.com.au/sitemap.xml` there and in Bing Webmaster Tools.
- Clock schedule (Brisbane time): metrics every 15 minutes; last 35 days recomputed and old traffic pruned at 12:20 am; SEO audit and Google data at 3:10 am; insights at 6:30 am; briefings on the hour you set.

## Site health, errors and Claude (Admin → Site health)
Watches the site's own machinery every minute and tells you when something breaks, then helps you fix it.
- **Checks** (from the every-minute clock; the message sender runs them too if the clock stops): is the auction clock running and finishing, are auctions and offer periods closing on time, are winners being charged, are emails, texts and app alerts going out (and if not, the provider's reason), is the database fast, near its connection or size limit, or stuck on a long query, does every table have row-level security, do the home page and app feed load (tested from outside every 5 minutes), are there more errors than usual, did last night's jobs run, and on the live site: test mode off, live Stripe key, every service connected.
- **Alerts:** when a check breaks, every admin gets an email, a text (switch off at the bottom of the page) and an app alert, and another when it's fixed. Set `HEALTH_ALERT_EMAIL` for an email even when the database itself is down, and add a free outside monitor (UptimeRobot or Better Stack) on `https://tyrebiter.com.au/api/health`: it answers OK, or an error when something's broken or the clock has stopped, so you hear about it even if the whole site is down.
- **Errors** from visitors' browsers, the server, the phone app and the clock are grouped (the same bug on 500 vehicles is one error with a count), with hourly charts, and cleaned before they're kept (no emails, phone or card numbers, codes or tokens). Mark them fixed (they reopen themselves if they come back) or ignore them. A friendly "Something went wrong" page replaces the default error page.
- **One-press fixes** next to a check: Run the clock now (closes due auctions, charges winners, sends waiting messages) and Retry failed messages.
- **Ask Claude** (needs `ANTHROPIC_API_KEY`; model `HEALTH_AI_MODEL`, default `claude-sonnet-5`): a panel on the page where Claude looks at the checks, errors, the clock's runs, failed messages, what the database is doing, recent changes and the code, then explains in plain English what's wrong, who it affects and what to do. It can only look: it suggests a one-press fix (you press it) or drafts a job for Claude Code (you read it and send it).
- **Fix with Claude Code:** sends the problem to Claude Code as a GitHub issue. Claude Code works on a copy of the code, follows `CLAUDE.md` and commits a change to its own branch; it can read and write code but can't run commands, and the tests run on its change by themselves. Its progress shows on the page (and you're emailed when it's ready); reply to it from the page, then "Get it ready to go live" (a pull request: Vercel makes a preview, and the files it changes are listed, with sensitive ones flagged) and "Put it live" (only the exact change you were shown, only once the `test` job has passed on it, and never a change to the GitHub workflows). If the error comes back after that, it reopens by itself.
- **If your GitHub repository is public** (it is today), anyone can read its issues, so error messages and stack traces are left out of what's sent to Claude Code and the page warns you. Make the repository private (GitHub → the repository → Settings → General → Danger Zone → Change visibility) and protect `main` (Settings → Rules → Rulesets: require a pull request and the `test` check).
- **Set it up** (about 15 minutes, the page shows the steps): install the Claude GitHub app on the repository (github.com/apps/claude); add the repository secret `ANTHROPIC_API_KEY` (or `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` on a Pro or Max plan); make a fine-grained GitHub token for this repository only (Contents, Issues and Pull requests: read and write; Checks, Commit statuses and Deployments: read); then set `GITHUB_TOKEN` and `GITHUB_REPO` in Vercel. The workflows are in `.github/workflows/` (`claude.yml` for Claude Code, `ci.yml` for the tests every change must pass).

## Checking vehicles, pickups, depots and dealers
- **No viewings:** buyers never go to the seller's place, and never get the seller's name, address or phone. Each listing has "How to check it.": our walkaround and visual inspection, the photos and damage map, the seller's walkaround video (checked before it goes up) and the seller's written answers. Questions come to you.
- **Mechanical inspections:** buyers order one from the listing; it goes to your inspection partner (Admin → Partners, kind "inspection") as a lead, with only the suburb. You call the seller to agree a time and give the mechanic the address. The buyer pays the mechanic and gets the report; they never attend.
- **Depots (Admin → Depots):** add each yard your transport partner delivers to, with its street address (private), hours, and the email and mobile that get the handover link. Every listing names its depot; the listing shows the depot's suburb, never the seller's.
- **Before a vehicle goes live:** choose the depot, enter the transport amount (your partner's quote from the seller to the depot, before GST; it goes into the buyer's premium and is fixed once bidding opens), say whether a statutory warranty applies, and record the pickup address (Seller, private). The listing checks include "nothing in the photos, video or words shows who or where the seller is". Photos uploaded in the editor lose the location the camera saved, and videos lose the place they were filmed when they're published.
- **Pickups (Admin → Pickups):** each paid vehicle appears here. Send it to the transport partner (the booking email has the seller's address and is marked confidential), book the day (the seller gets the TR- reference the driver quotes), then mark it picked up (with anything the driver found that isn't in the listing: the buyer then chooses to go ahead or cancel for a full refund) and at the depot.
- **Collections (Admin → Collections):** once it's at the depot and the transfer is done, the buyer books a time. Check it with the depot, confirm it: the buyer gets the depot's address and a release code, the depot gets the handover link.
- **Inspected listings:** sellers can tick "inspect it before it lists" when they sign (fee in **Admin → Fees & settings → Selling checks**, taken from the proceeds only if it sells). Book the mechanic, then fill in "Mechanical inspection" in the vehicle editor and upload the report PDF: the listing gets an "Inspected" badge and buyers can filter for it.
- **Dealer accounts:** businesses apply in their account; check the ABN on abr.business.gov.au and approve in **Admin → Dealers** (set `ABR_GUID`, free from the ABR, to check it automatically). Approved dealers pay several invoices with one transfer using their own reference; record it with "mark paid" on the same page.
- **Reviews:** add your Google review link in **Admin → Fees & settings → Reviews**. Every buyer is asked after collection and every seller after their payout.

## Live auctions, tenders, BPAY and the calendar

- **Run a live auction** (like PicklesLIVE or Manheim Simulcast): Admin → Sales & live auctions → New sale → "Live auction". Set the start time, how long each vehicle is offered (say 60 seconds) and the reset after a bid (say 20 seconds). Optionally paste a YouTube or Vimeo live link for the video. Add vehicles to the sale from the vehicle editor or the bulk upload. Buyers can bid early on each one straight away.
- On the day, open **Auctioneer console** for the sale and press Start. You see the vehicle that's up, its reserve, the countdown and the latest bids. Calls ("Fair warning", "Last call", your own words) show to every bidder. You can pause, add 30 seconds, knock it down now, offer the next vehicle (or let it move on by itself 3 seconds after each one closes), take a **floor or phone bid** for a registered member by their bidder number (BID… on their account) or BPAY CRN, reorder what's left, and end the sale. If you close the console, the sale keeps running by itself (one vehicle at a time, checked every minute) unless you untick that option.
- **Tenders**: in the vehicle editor, "How it's sold" → Tender. Buyers put in one sealed amount each; only the number of tenders shows. It closes on time, and the highest tender buys at its own amount if it meets the reserve.
- **BPAY**: get a biller code from your bank and set `NEXT_PUBLIC_BPAY_BILLER`. Each member already has their own CRN. Record a BPAY deposit in Admin → Deposits with the CRN, and find an invoice from a bank statement reference in Admin → Invoices.
- **Damage map**: in the editor, pick where each flaw is ("Bonnet", "Left rear (passenger side)" and so on). Listings then show a drawing with numbered pins.
- **Calendar** (`/calendar`, also as a calendar file buyers can subscribe to) and **results** (Auctions → Recently closed) are automatic.

## Security
Nothing online is unhackable, so the site is built in layers: if one is beaten, the next still holds, and you hear about it.
- **The database is the last line.** Every table has row-level security (a test fails if one doesn't), private data (reserves, seller details, bidders' real names, bank details) is only readable by admins, and the rules for bids, money and bans run inside the database, so a fake request can't skip them. Privileged database functions are closed to the public except a short reviewed list (a test and Site health both check it).
- **Admins need two-step sign-in.** An admin's password alone gets nothing: no Admin pages, no admin API and no admin rights in the database. Each admin sets up an authenticator app the first time they open Admin. Admin → Security shows who has admin access, who has set up two-step, and can switch it off (please don't).
- **Admin log.** Everything admins do (in Admin and straight to the database from the vehicle editor) is written to a log that nobody can change or delete, with the network and device. Bank details, passwords and codes are never written to it. Every admin is told at once when someone is made an admin, and Site health warns about new admins and repeated refused admin requests.
- **Browser protections on every page:** a Content Security Policy (only our site, Supabase and Stripe can load anything), no framing (stops click-jacking), HTTPS-only once live (HSTS), and signed-in pages never stored by shared caches.
- **Requests from other sites are refused.** Another website can't make a signed-in member's browser bid, pay or change their details. Sign-in links only ever send people to pages on Tyrebiter.
- **Limits** on SMS codes, ID checks, profile changes, claims, questions, reports and forms, on top of Vercel's firewall rules (step 2.6 above) and Supabase's own sign-in limits.
- **Checked on every change:** the Tests workflow runs the security tests and `npm audit` (known holes in the packages the site runs on) and looks for passwords or keys accidentally committed. GitHub's CodeQL scans the code for security holes every week and on every change, and Dependabot opens a pull request when a package gets a security fix.
- **Reporting:** `/.well-known/security.txt` and `/security-policy` tell security researchers how to report a hole privately (set `SECURITY_EMAIL`, otherwise it uses the support address).

**Your security checklist** (things only you can do):
- [ ] Make the GitHub repository **private** and protect `main` (see "Site health" above). While it's public, anyone can read the code and look for mistakes.
- [ ] Turn on two-step sign-in for your own **GitHub, Vercel, Supabase, Stripe, Twilio, Resend, Google and email** accounts, with an authenticator app. Whoever gets into one of these gets into the site.
- [ ] Supabase: leaked-password protection and minimum password length 10 (setup step 1.12), TOTP enabled (step 1.11).
- [ ] A long random `CRON_SECRET` and `LINK_SECRET` (32+ characters each), different from each other. Never paste the `service_role` key anywhere but Vercel's environment variables.
- [ ] Vercel: the firewall rate-limit rules (step 2.6), and **Deployment Protection** on preview deployments.
- [ ] Set up two-step in Admin the first time you open it, and check **Admin → Security** now and then.
- [ ] Before launch, consider a professional penetration test (an Australian firm, a few days' work), and repeat it after big changes.

## Sample photos
The sample listings start without photos. Never copy photos from other listing sites: they belong to their sellers and photographers. To fill the samples with openly licensed photos of the same makes and models (Wikimedia Commons, with a credit on each), run on a computer with internet access:
```bash
npm run sample-photos -- --dry   # see what it would use
npm run sample-photos            # saves photos to public/sample-photos/ and writes supabase/sample-photos.sql
```
Look through `public/sample-photos/`, delete any that don't match, then run `supabase/sample-photos.sql` in the SQL Editor. Each photo shows its credit on the listing. Delete them with the sample vehicles before launch.

## Before launch
- [ ] `NEXT_PUBLIC_TEST_MODE=false`
- [ ] Real fees (including the seller fee) in **Admin → Fees & settings**. The Terms, Help and Seller agreement pick the numbers up automatically. Fill the remaining `[brackets]` in `src/content/legal.ts` (governing state, trust account)
- [ ] Licence numbers for every state you sell in, in **Admin → Fees & settings → Licences** (shown in the footer and Terms). Don't sell in a state until its licence is in place
- [ ] Lawyer to confirm the consumer-rights wording (`src/lib/listing.ts` and Terms section 4) for auction, Buy Now, accepted offers and offers to the next bidder, private and business sellers, and whether cooling-off or dealer warranties apply to Buy Now in any state
- [ ] Transport and warranty partners signed (warranty providers: their AFSL, PDS and TMD), or the sample ones removed
- [ ] Your real depots in **Admin → Depots** (street address, hours, the email and mobile for handover links) and the sample depots removed; a transport amount on every vehicle before it goes live
- [ ] A written agreement with your transport partner and each depot: due care, insurance while vehicles are in transit and at the depot, keeping sellers' details confidential, and handing over only for the release code
- [ ] The newsletter switched on in **Admin → Newsletter** only once you have opted-in members
- [ ] **Admin → Fees & settings → Selling checks** is ON
- [ ] Public holidays for next year added to the `public_holidays` table (the business-day maths skips them)
- [ ] Terms of sale, Seller agency agreement, Website terms and Privacy policy reviewed by an Australian lawyer (send them the `[LAWYER ...]` notes in `src/content/legal.ts`): consumer-law wording for auction vs Buy Now/offer sales and business sellers, state safety-certificate and registration rules, motor dealer and auctioneer licensing in each state, whether sale proceeds and bidding deposits must sit in a trust account (Terms section 8 has a placeholder), unfair contract terms (keeping a 10% deposit on non-payment, withdrawal and cancellation fees, overdue interest, the indemnities), storage and uncollected goods in each state, whether an accepted referred bid is a sale by auction, selling as agent without naming the seller, Victoria's rules on selling private sellers' vehicles on consignment (whether Buy Now, tenders and offers are allowed, or only public auction), New South Wales consignment and trust account rules, Queensland's buyer's premium (seller's written agreement, how it's shown) and statutory warranty statement, your responsibility for vehicles in transit and at the depot, and states whose transfer form shows the seller's name or address
- [ ] Accountant to confirm GST handling when a GST-registered seller sells through you as agent (including whether to agree that Tyrebiter is treated as the supplier, Subdivision 153-B, so the buyer's tax invoice needn't name the seller)
- [ ] ABN, licence number, phone, email and the trust account details in the environment variables and footer
- [ ] A real payment by PayID from your own account for a test invoice, marked received (or recorded by Azupay)
- [ ] Sample vehicles, sample photos, the sample consultant and the sample partners deleted (sample partners are hidden automatically once test mode is off)
- [ ] Signed referral agreements with every partner, and a lawyer's sign-off on `/finance` (credit referrer wording and the comparison rate warning) and `/insurance` (general advice warning, your licence arrangement)
- [ ] Storage upload limit raised to 250 MB
- [ ] The Sell page tried with a few real plates and VINs
- [ ] Google Search Console and Bing Webmaster Tools set up, sitemap submitted, `GOOGLE_SERVICE_ACCOUNT` and `GSC_SITE` set (Admin → SEO shows the steps)
- [ ] `ANTHROPIC_API_KEY` set if you want the weekly briefing summarised by Claude and Ask Claude in Site health
- [ ] Everything in "Your security checklist" under Security
- [ ] Claude Code set up (Admin → Site health → Set up Claude), the GitHub repository made private with `main` protected (pull request and the `test` check required), a free outside monitor on `/api/health`, and `HEALTH_ALERT_EMAIL` set
- [ ] Admin → Site health all green on the live site (test mode off, live Stripe key, every service connected, `LINK_SECRET` set)
- [ ] Transfer steps and links in `src/lib/transfer.ts` checked against each state's transport authority, and the certificate of sale wording checked by your lawyer (including Queensland safety certificate and Victorian roadworthy rules for registered vehicles)
- [ ] A full test sale paid by PayID: win, payment received, then cancel and refund
- [ ] Phone apps: the same test sale from the iPhone and Android apps, and a push alert received on each

## Running it on your computer
```bash
npm install
cp .env.example .env.local   # fill in your Supabase keys
npm run dev
```
