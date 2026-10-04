# Tyrebiter for iPhone and Android

A native app (Expo / React Native) that uses the same database, rules and API as the website. Everything a member can do on the site works here: search, watch, bid, buy now, offers, alerts, invoices, transfer of ownership, collection, claims, selling (with the plate lookup) and the seller dashboard. It adds push notifications, the phone's own card form (Stripe) and in-app account deletion.

- Screens live in `src/app` (one file per screen). Shared pieces are in `src/ui`, plumbing in `src/lib`.
- Search, vehicle lists, fees and formatting are the website's own code (`../src/lib`), so both stay in step.
- Money and bidding rules stay in the database. The app never decides a price; it asks the website's API.

## Getting it into the stores

You need four accounts. Do steps 1 and 2 now: Apple and Google can take a week or two to check a company.

| Account | Cost | Notes |
|---|---|---|
| Apple Developer Program | US$99 a year (AU$149 in Australia) | developer.apple.com/programs/enroll. Enrol as an **organisation** (Tyrebiter Pty Ltd) so the store shows the company, not your name. Needs a free D-U-N-S number. |
| Google Play Console | US$25 once | play.google.com/console. Register as an **organisation** with the same D-U-N-S number. A *personal* account would have to run a 14-day test with 12 testers before it's allowed to publish. |
| Expo | Free to start | expo.dev. Builds the apps in the cloud, so you don't need a Mac. |
| Firebase | Free | console.firebase.google.com. Android push notifications go through it. |

Claude Code can run every command below for you. Where a step needs you to click around a website, it says so.

### 1. Get a D-U-N-S number
Apple's lookup tool (developer.apple.com/enroll/duns-lookup) finds Tyrebiter Pty Ltd or requests a number for free. It can take up to two weeks. Use the same number for Apple and Google.

### 2. Open the Apple and Google accounts
Enrol in the Apple Developer Program and create the Google Play developer account as above.

### 3. Connect this project to Expo
```
npm install -g eas-cli
eas login
cd mobile
npm install
eas init
```
`eas init` prints a project ID and your Expo username. Paste them into `EAS_PROJECT_ID` and `EAS_OWNER` near the top of `app.config.ts` (or ask Claude Code to).

### 4. Put the website live first
The app talks to the live website, so these go first:
- Run `supabase/migrations/20261003000007_app.sql` in the Supabase SQL editor (push devices, push alerts, account deletion).
- Then run `supabase/migrations/20261003000008_media_partners.sql` (listing videos, consultants, mobile inspections, finance and insurance partners, blurred bidder names).
- Then run `supabase/migrations/20261004000009_rego_transfer.sql` (registered/unregistered on listings, one video in 10 photos and videos, plate lookups, transfer of ownership before collection).
- Then run `supabase/migrations/20261004000010_free_lookup.sql` (our own free plate and VIN lookup) and `supabase/migrations/20261004000011_lookup_australia_only.sql`.
- Deploy the website (it has the new `/api` routes the app uses).

### 5. Tell Expo the app's settings
On expo.dev, open the project, then **Environment variables**. Add each of these for **production** and **preview** (visibility "Plain text" is fine, they're public keys):

| Name | Value |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | same as `NEXT_PUBLIC_SUPABASE_URL` on the website |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | same as `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | same as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (the `pk_live_...` key) |

The website address (`https://tyrebiter.com.au`) is already set in `eas.json`. If the domain changes, change it there.

### 6. Android push notifications (Firebase)
1. In Firebase, create a project called Tyrebiter. Add an **Android app** with package name `au.com.tyrebiter.app`. Download `google-services.json`.
2. On expo.dev, add an environment variable named `GOOGLE_SERVICES_JSON`, type **File**, visibility **Secret**, and upload that file (production and preview).
3. In Firebase: Project settings, **Service accounts**, **Generate new private key**. Then run `eas credentials -p android`, choose production, then **Google Service Account**, then **Push Notifications (FCM V1)**, and upload that key.

iPhone push needs nothing extra: the first iPhone build asks to create a push key, say yes.

### 7. Try it on your own phone
- **Android:** `eas build -p android --profile preview`. When it finishes, open the link on your phone and install it.
- **iPhone:** `eas device:create` (open the link on your iPhone to register it), then `eas build -p ios --profile preview`, then open the link on the iPhone.

The preview builds talk to the live website. Use the test drive or a test-mode copy of the site if you don't want to touch real data.

### 8. Build the store versions
```
eas build -p all --profile production
```
The first iPhone build asks you to sign in to Apple and creates the certificates for you. Say yes to everything.

### 9. Make the reviewers' demo account
Apple and Google both sign in to check the app. On the website, join as `appreview@tyrebiter.com.au` with a strong password. Stop at the mobile step. Then in the Supabase SQL editor:
```sql
update profiles set details_done = true, first_name = 'App', last_name = 'Review', mobile = '0400000000',
  mobile_verified = true, id_status = 'verified',
  terms_version = (select value->>'buyer_version' from settings where key = 'terms')
where email = 'appreview@tyrebiter.com.au';
```
It has no card on purpose, so a reviewer can see everything but can't place a real bid.

### 10. Send it to Apple
1. `eas submit -p ios --latest`. The first time, it creates the app in App Store Connect for you.
2. In App Store Connect, fill in the listing from `store/LISTING.md`: name, subtitle, description, keywords, category, privacy answers, age rating and review notes with the demo account.
3. Upload `store/screenshots/iphone/01.png` to `06.png` into the 6.9" iPhone slot.
4. Choose the build, then **Add for Review**. Reviews usually take a day or two.

### 11. Send it to Google
1. In Play Console, **Create app**: Tyrebiter: Vehicle Auctions, App, Free.
2. Fill in **Store listing** and every item under **App content** from `store/LISTING.md` (privacy policy, app access with the demo account, ads, content rating, target audience, data safety, data deletion).
3. Upload `store/play-icon-512.png`, `store/play-feature-graphic.png` and `store/screenshots/android/01.png` to `06.png`.
4. Google needs the first upload done by hand: open the production build on expo.dev, download the `.aab` file, then in Play Console go to **Test and release > Production > Create new release** and upload it.
5. Send it for review. Later updates can go up with `eas submit -p android --latest` once you add a Google service account key (Play Console > Users and permissions; Claude Code can walk you through it).

### 12. Once the apps are live
Add these to the website's environment (Vercel) and redeploy:

| Name | Where to find it | What it does |
|---|---|---|
| `APPLE_TEAM_ID` | developer.apple.com > Membership (10 characters) | Website links open in the iPhone app; saved passwords fill in |
| `ANDROID_CERT_SHA256` | Play Console > Test and release > App integrity > App signing. Copy the SHA-256 of the app signing key and the upload key, comma separated | Same for Android |
| `NEXT_PUBLIC_APP_STORE_URL` | the app's App Store link | "Get the app" in the footer, and the "Open in app" banner in iPhone Safari |
| `NEXT_PUBLIC_PLAY_STORE_URL` | the app's Play Store link | "Get the app" in the footer |

Optional: `EXPO_ACCESS_TOKEN` (expo.dev > Access tokens) on the website raises the push sending limit.

## Updating the app later
- **Text, screens and fixes:** `eas update --channel production --environment production --message "what changed"`. Phones download it the next time the app opens and use it from the launch after that. No store review needed.
- **New native features or a new Expo version:** bump `version` in `app.config.ts`, run steps 8, 10 and 11 again. (Listing videos use `expo-video`, a native module, so phones need a build that includes it: an `eas update` alone isn't enough for that change.)
- **Forcing very old versions to update** (for example after a terms change): in the Supabase SQL editor,
  `update settings set value = '{"min_ios":"1.2.0","min_android":"1.2.0"}' where key = 'app';`
  Older apps then show "Time for an update" with a link to the store.

## For developers
```
cd mobile
npm install
npx expo start          # then scan the QR code with a development build
npm run typecheck
npm test                # website-link to app-screen mapping
npx expo export -p web  # the same app in a browser, used for the end-to-end tests
```
Local settings go in `mobile/.env.local` (the same `EXPO_PUBLIC_...` names as step 5, plus `EXPO_PUBLIC_SITE_URL`).

How it fits together:
- **Sign-in** is Supabase Auth. The app sends its session as `Authorization: Bearer ...` to the website's `/api` routes; `supabaseServer()` accepts either that or the website's cookie.
- **Public data** (home, search, lots, config) is fetched without a session so the edge cache serves it, exactly like the website.
- **Private lists** (watchlist, bids, invoices, notifications) are read straight from Supabase with row level security.
- **Live prices** use the same Realtime broadcast (`lot:<id>`) as the website, with `/api/lots/<id>/live` polling as a fallback.
- **Push**: the app registers its Expo push token at `POST /api/push`. A database trigger on `notifications` queues one 'push' outbox row per alert, and `drainOutbox` sends them in batches of 100 (`src/lib/push.ts` on the website). Dead tokens are switched off automatically.
- **Payments** use Stripe's PaymentSheet for saving a card (SetupIntent) and paying (PaymentIntent).
- **Account deletion** is `GET/POST /api/account/delete`. It refuses while bids, purchases or listings are in progress, then anonymises the profile, removes the Stripe customer and deletes the sign-in.
- **Links**: `src/lib/links.ts` maps website links (emails, SMS, shared lots) to app screens. Universal links come from `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` on the website (step 12).
- **Store images**: `store/` holds the listing copy, screenshots, feature graphic and icon. `assets/` holds the app icon, Android adaptive icon, notification icon and splash, all drawn from the Tyrebiter ring.
