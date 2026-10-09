# Tyrebiter

Online auctions for cars, utes, trucks, motorbikes, caravans, boats and machinery across Australia.

Built with **Next.js** (the website), **Supabase** (database, logins, live bid updates, photo storage), **Stripe** (saved cards, automatic charging, ID checks), **Twilio** (SMS codes and alerts) and **Resend** (email). Hosted on **Vercel**.

---

## What's in it

**For buyers**
- Browse and search live auctions, collections and filters
- Lot pages with a big photo and four smaller ones, a full-screen viewer, up to 10 photos and videos (one walkaround video, shown second), registered or unregistered (plate, state and expiry, like Grays), visual grade, damage and wear, checks, live countdown and live bid updates
- Bid history with every bidder's name blurred (a made-up name per bidder per vehicle; real names never leave the database)
- Auto-bidding with private maximums, bid increments, ties go to the earlier maximum
- Going, going, gone: bids in the last 10 minutes add 10 minutes
- Reserve met / not met, referral to the seller, Make an Offer, Buy Now
- All-in price beside every price (listing cards, the current bid, Buy Now, offers, the newsletter) and a preview as you type (premium, GST, admin fee; no card surcharge)
- Listings checked against the vehicle before they go live (VIN plate, build date, odometer photo, transmission, fuel, features, warning lights, starts and drives, damage photos), shown as "Checked against the vehicle"; private or business seller on every listing; "Starts and drives" filter; EV battery health; plain consumer-rights wording for auction and Buy Now sales (`/listing-promise`, `src/lib/listing.ts`)
- Corrections in public: any later change to a key fact is shown under "Changes to this listing", sent to bidders and watchers, and bidding gets at least 24 more hours
- Fleet sales (`/sales`): one seller's vehicles on one page, closing a few minutes apart
- Offer to the next bidder when a winner doesn't pay (`/offers/[id]`, no obligation, all-in price shown)
- Landing pages for search engines (`/for-sale/utes`, `/for-sale/utes/qld`): real listings and recent results only, not indexed when empty
- Recently viewed and "For you" (your saved search) on the home page, private notes on watched vehicles, help centre search, and on the Sell page what similar vehicles sold for here (only with 3 or more sales)
- Transport quotes from a carrier partner (listing and invoice), carrier tracking link on the collection, and warranty and roadside assistance providers (`/warranty`)
- Weekly newsletter for members who opt in (one-click unsubscribe)
- 5-step sign-up: account → details → SMS code → card on file → ID check
- Automatic payment when you win: under $5,000 charged in full, otherwise a non-refundable deposit plus bank transfer
- Declined-card "Pay now" flow, invoices, nominate a collector
- Watchlist with 1-hour reminders, saved searches with alerts, notification settings
- No in-person viewings: buyers order an independent mobile inspection, or call the vehicle's consultant
- Finance and insurance comparison (`/finance`, `/insurance`), with a repayment estimate on every listing; enquiries go to partners only with the member's permission
- Delivery quote request, report a concern
- Sell page: type the rego plate (any state) and VIN, and our own free lookup fills in the vehicle (vehicles we've listed, VIN patterns learned from our listings, the VIN itself); the seller checks it and adds kilometres, condition and photos
- Transfer of ownership between payment and collection: registered vehicles are transferred into the buyer's name (seller lodges their part, buyer uploads the confirmation, we check it); unregistered vehicles get a certificate of sale and the buyer says how they'll move it. The pickup address is only released after payment, the transfer and a confirmed collection time
- Help centre, Terms of sale, Website terms, Seller agency agreement, Privacy policy

**For you (admin at /admin)**
- Dashboard of everything that needs attention
- List a vehicle: details, story, condition report, photos, flaws, reserve, Buy Now, timing, private seller details
- Referrals and offers: record the seller's decision (accepting charges the buyer straight away)
- Invoices: retry cards, mark balances received, mark collected, cancel with fee
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
   6. `supabase/migrations/20261003000006_search.sql`
   7. `supabase/migrations/20261003000007_app.sql` (phone apps: push notifications, account deletion)
   8. `supabase/migrations/20261003000008_media_partners.sql` (listing videos, blurred bidder names, consultants, finance/insurance/inspection partners and enquiries)
   9. `supabase/migrations/20261004000009_rego_transfer.sql` (registered/unregistered on every listing, one video inside 10 photos and videos, plate lookups, transfer of ownership before collection)
   10. `supabase/migrations/20261004000010_free_lookup.sql` (our own free plate and VIN lookup)
   11. `supabase/migrations/20261004000011_lookup_australia_only.sql` (keeps the lookup to Australian sources)
   12. `supabase/migrations/20261004000012_accuracy_fleet_partners.sql` (listing checks, public corrections, seller type, fleet sales, relisting, offers to the next bidder, transport and warranty partners, listing audits, newsletter)
   13. `supabase/seed.sql` (optional sample vehicles, a sample consultant and sample partners; delete them before launch)
   14. Optional: `supabase/sample-photos.sql`, made by `npm run sample-photos` (see "Sample photos" below)
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
11. **Authentication → Rate Limits**: raise "emails sent" (custom SMTP starts at 30 an hour), sign-ups/sign-ins and token refreshes to suit launch traffic. Tell Supabase support 2 weeks before a big launch.

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
- [ ] On the Sell page, type a plate you've listed (it fills in from our records), then a VIN you haven't (it fills in the maker and year); send the request and see it in Admin → Appraisals
- [ ] As admin, list a vehicle ending in 15 minutes with a reserve, registered (plate, state, expiry), and publish it; add a video in the editor and see it second in the gallery
- [ ] From a second account, bid below the reserve; from the first, outbid them (the second gets an outbid email)
- [ ] Bid in the last 10 minutes: the clock jumps back to 10 minutes on both screens
- [ ] Let it end: the winner's invoice appears, marked paid (test mode), and the win email arrives
- [ ] Repeat with a bid below the reserve: it shows "Referred to the seller"; decline it in Admin → Referrals & offers, make an offer, accept it
- [ ] Buy Now on a vehicle over $5,000: $500 deposit, balance shown with bank details
- [ ] As a fully verified member, order a mobile inspection on a listing: you get a reference, emails go to the partner, the buyer and your team, and it shows in Admin → Leads
- [ ] On a listing, open "Compare car loans" and send an enquiry to a lender; record a fee against it in Admin → Leads
- [ ] As the seller, add a video from the seller dashboard; approve it in Admin → Videos; it plays on the listing
- [ ] Bid from two accounts: the bid history shows blurred names, the same blurred name for the same bidder
- [ ] Request an appraisal on the Sell page with photos: it appears in Admin → Appraisals
- [ ] Seller flow: in Admin, turn the appraisal into a draft listing, copy the seller link (or "Text + email it"), open it signed in as a third account, verify ID, answer the questions, upload a photo as the rego papers, add bank details, sign
- [ ] Try to publish before ticking "Papers match" and adding the VIN + PPSR date: it refuses and says why. Then publish
- [ ] Sign in as the seller and try to bid on your own vehicle: refused
- [ ] End it below the reserve: the seller gets a text, accepts in their dashboard, the buyer is charged and gets the tax invoice PDF by email
- [ ] After payment, the buyer's invoice shows the transfer step: upload a photo as the transfer confirmation, complete it in Admin → Transfers; the seller marks their part done from their dashboard
- [ ] Buyer books a collection; confirm it in Admin → Collections; the buyer sees the address and release code, the seller gets the handover link; enter the code on the handover page
- [ ] Lodge a claim from the invoice: the payout goes on hold; reject it: the payout goes back
- [ ] Wind the claim window back (or wait 2 business days): the payout shows Ready; confirm the bank details by phone and mark it paid; the seller gets the statement
- [ ] Ask a question on a lot; answer and publish it in Admin → Questions
- [ ] Click "Manage alerts" in an email: settings open without signing in; unsubscribe works

Then add the Stripe keys (test keys first: card `4242 4242 4242 4242`, and `4000 0000 0000 9995` to test a declined charge) and Twilio, and repeat.

## Automated tests
`npm run test:db` runs 311 checks of the auction engine, payment maths, seller agreement, publish checks, collection codes, claims, payouts, the message queue and every security rule against a real Postgres database (set `PGHOST`/`PGPORT` to a local Postgres you can create databases on). `npm run test:unit` checks the search parser, the finance maths, the lookup tidying and the VIN decoder.

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
- **All-in prices** beside every price; no card surcharge (banned from 1 October 2026).
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

## Transfer of ownership (between payment and collection)
When an invoice is paid in full, the buyer's invoice shows a **Transfer of ownership** step and the seller's dashboard shows theirs, with the steps and official links for the vehicle's state (`src/lib/transfer.ts`, checked October 2026; recheck each state's page before launch).
- **Registered:** the seller lodges their part (notice of disposal, or starting the transfer online); your consultant gives them the buyer's details the form needs. The buyer transfers the registration and uploads the confirmation (or enters the receipt number). Check it in **Admin → Transfers** and complete it. A buyer who can't register it in that state can choose to take it unregistered: the seller cancels the registration and keeps the plates.
- **Unregistered:** the buyer confirms the certificate of sale (a PDF from their invoice, issued by Tyrebiter as agent for the owner) and how it will be moved: carrier, trailer, or the state's unregistered vehicle permit. This completes straight away.
- Collection can only be booked once the transfer is complete, and the collection window starts then. The pickup address is sent once the collection time is confirmed.
- Proof files are kept in the private `transfer-docs` storage bucket.

## Terms, payment and liability (version 10 October 2026)
Written in our own words after comparing the payment terms and site terms of Grays/Slattery, Pickles and Manheim, keeping what protects buyers, sellers and Tyrebiter and leaving out terms the unfair contract terms laws catch (termination "for any reason", 1%-a-day late fees, one-sided changes, blanket exclusions). `src/content/legal.ts`: Terms of sale (20 sections), Seller agency agreement, Website terms (`/website-terms`), Help.
- **Paying:** card under the card limit; otherwise a deposit (kept only if the buyer doesn't pay) and the balance by bank transfer or PayID. No cash or cheques, only into the account on the invoice page, payer must be the buyer (or approved). Interest on overdue balances at the rate in **Fees & settings** (default 10% a year, capped at 20), no other late fees.
- **Not paying:** an overdue reminder (clock), then 1 business day. **Admin → Invoices → Cancel: buyer didn't pay** refuses earlier, keeps the deposit *or* charges the cancellation fee (never both), and gives the seller half as a `forfeit` payout.
- **Cancel and refund** (Admin → Invoices) for anything that isn't the buyer's fault (upheld claim, title problem, damage before handover, our mistake): refunds the card in Stripe, lists any bank refund to make, cancels the seller payout and open collection bookings.
- **Fees are locked per vehicle** when it goes live (`lots.fees`); a fee change applies only to vehicles listed afterwards. The seller fee comes from the copy saved when the seller signed. Each invoice records the terms version the buyer accepted.
- **Storage** only starts once the registration transfer is complete and the collection window has passed.
- **Late bids:** any bid in the closing minutes extends the auction, including a leader raising their maximum to meet the reserve. The reserve can be lowered but never raised once there are bids.
- **Corrections** also cover the title, description, location, plate and the damage list (damage edits are announced once staff stop editing for 5 minutes).
- Sellers also declare previous use (taxi, rideshare, hire, driving school, police) and unfixed safety recalls; both show on the listing.

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
- [ ] The newsletter switched on in **Admin → Newsletter** only once you have opted-in members
- [ ] **Admin → Fees & settings → Selling checks** is ON
- [ ] Public holidays for next year added to the `public_holidays` table (the business-day maths skips them)
- [ ] Terms of sale, Seller agency agreement, Website terms and Privacy policy reviewed by an Australian lawyer (send them the `[LAWYER ...]` notes in `src/content/legal.ts`): consumer-law wording for auction vs Buy Now/offer sales and business sellers, state safety-certificate and registration rules, motor dealer and auctioneer licensing in each state, whether sale proceeds must sit in a trust account, unfair contract terms (deposit forfeiture, withdrawal and cancellation fees, overdue interest, the indemnities), storage and uncollected goods in each state, whether an accepted referred bid is a sale by auction
- [ ] Accountant to confirm GST handling when a GST-registered seller sells through you as agent
- [ ] ABN, licence number, phone, email and bank details in the environment variables and footer
- [ ] Sample vehicles, sample photos, the sample consultant and the sample partners deleted (sample partners are hidden automatically once test mode is off)
- [ ] Signed referral agreements with every partner, and a lawyer's sign-off on `/finance` (credit referrer wording and the comparison rate warning) and `/insurance` (general advice warning, your licence arrangement)
- [ ] Storage upload limit raised to 250 MB
- [ ] The Sell page tried with a few real plates and VINs
- [ ] Transfer steps and links in `src/lib/transfer.ts` checked against each state's transport authority, and the certificate of sale wording checked by your lawyer (including Queensland safety certificate and Victorian roadworthy rules for registered vehicles)
- [ ] A full test sale with a real card, then refunded in Stripe
- [ ] Phone apps: the same test sale from the iPhone and Android apps, and a push alert received on each

## Running it on your computer
```bash
npm install
cp .env.example .env.local   # fill in your Supabase keys
npm run dev
```
