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

**The auction clock** (`/api/cron/process`, every minute) closes auctions, creates invoices, charges winners, and sends referral, offer, reminder and saved-search alerts.

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
   3. `supabase/seed.sql` (optional sample vehicles; delete them before launch)
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

### 2. Vercel (hosting)
1. Import this GitHub repository at vercel.com/new.
2. Add the environment variables from `.env.example` (Settings → Environment Variables). Make up a long random `CRON_SECRET`.
3. Deploy, then point `tyrebiter.com.au` at it under Settings → Domains.
4. The auction clock needs a job every minute. Vercel Pro runs `vercel.json` automatically. On the free plan, run `supabase/cron.sql` in Supabase instead (put your site address and `CRON_SECRET` in it first).

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
3. Buy or register an Australian sender (a number or alphanumeric sender ID) for alerts and put it in `TWILIO_FROM_NUMBER`.

### 6. Resend (email)
Create an account at resend.com, verify `tyrebiter.com.au`, and add the API key.

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

Then add the Stripe keys (test keys first: card `4242 4242 4242 4242`, and `4000 0000 0000 9995` to test a declined charge) and Twilio, and repeat.

## Automated tests
`npm run test:db` runs 80 checks of the auction engine, payments maths and every security rule against a real Postgres database (set `PGHOST`/`PGPORT` to a local Postgres you can create databases on).

## Before launch
- [ ] `NEXT_PUBLIC_TEST_MODE=false`
- [ ] Real fees in **Admin → Fees & settings**, and the matching numbers filled into `src/content/legal.ts` (look for `[X]` and `[brackets]`)
- [ ] Terms of sale and Privacy policy reviewed by an Australian lawyer (consumer-law auction wording, state safety-certificate rules, motor dealer and auctioneer licensing)
- [ ] ABN, licence number, phone, email and bank details in the environment variables and footer
- [ ] Sample vehicles deleted
- [ ] A full test sale with a real card, then refunded in Stripe

## Running it on your computer
```bash
npm install
cp .env.example .env.local   # fill in your Supabase keys
npm run dev
```
