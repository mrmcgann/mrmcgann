# Tyrebiter: store listing copy and answers

Everything to paste into App Store Connect and Google Play Console. Character limits are in brackets; every field below fits.

Images in this folder:
- `screenshots/iphone/01.png` to `06.png`: 1290 × 2796, for the iPhone 6.9" slot (App Store Connect scales them down for smaller iPhones).
- `screenshots/android/01.png` to `06.png`: 1080 × 1920, for Google Play phone screenshots.
- `play-feature-graphic.png`: 1024 × 500, the Google Play feature graphic.
- `play-icon-512.png`: 512 × 512, the Google Play app icon. (The App Store takes the icon from the app itself.)

To remake them after the app changes, ask Claude Code to "recapture the store screenshots".

---

## Both stores

| Field | Text |
|---|---|
| App name [30] | Tyrebiter: Vehicle Auctions |
| Website | https://tyrebiter.com.au |
| Support / contact | https://tyrebiter.com.au/contact |
| Privacy policy | https://tyrebiter.com.au/privacy |
| Account deletion page | https://tyrebiter.com.au/delete-account |
| Support email | help@tyrebiter.com.au (whatever NEXT_PUBLIC_SUPPORT_EMAIL is) |

### Long description [4000]

```
Every car. Beautifully sold.

Tyrebiter runs live online auctions for cars, utes, 4x4s, vans, trucks, trailers, buses, motorbikes, caravans, boats and machinery, sold on behalf of their owners right across Australia. Every vehicle is photographed properly and described honestly, with a condition report and the faults shown up close.

SEARCH THE WAY YOU TALK
Type "HiLux under 30k in QLD", "LAMS bike" or "caravan sleeps 4" and we work out the make, price, state and features for you. Filter by category, make, model, year, price, kilometres or hours, fuel, transmission, licence class and more. Save a search and we'll tell you the moment a match is listed.

KNOW THE ALL-IN PRICE BEFORE YOU BID
Every lot shows what you'd pay if you win: the bid, the buyer's premium, GST and the admin fee, added up. No card surcharge.

BID IN SECONDS
Set your maximum and we bid for you, one increment at a time, only as far as needed to keep you in front. Bids in the last 10 minutes add 10 minutes, so nobody wins by sniping.

NEVER MISS THE FINISH
Watch vehicles and get a push alert when you're outbid, when an auction is about to end and when you win. Choose push, SMS or email for each kind of alert.

PAY, BOOK PICKUP, COLLECT
When you win, your tax invoice is in the app and your saved card is charged. Book a collection time, get the address once it's confirmed, and show your release code when you pick the vehicle up.

SELLING WITH TYREBITER
Get a free appraisal with photos from your phone. We photograph the vehicle at your place, list it and sell it to buyers Australia-wide. Track bids, watchers and views, and if bidding ends below your reserve, accept or decline from the app.

SAFE BY DESIGN
Every bidder verifies their mobile, card and ID before bidding. We never ask you to pay a seller directly, and our bank details never change by email or SMS.

Tyrebiter Pty Ltd sells as agent for the owner. You must be 18 or over to bid.
```

---

## App Store Connect (iPhone)

| Field | Text |
|---|---|
| Subtitle [30] | Cars, utes, trucks and more |
| Promotional text [170] | Live vehicle auctions Australia-wide. See the all-in price before you bid, get alerts when you're outbid, and pay and book pickup in the app. |
| Keywords [100] | car auction,ute,4x4,truck,motorbike,caravan,boat,machinery,used cars,bid,trailer,vehicle,auctions |
| Primary category | Shopping |
| Secondary category | Lifestyle |
| Copyright | 2026 Tyrebiter Pty Ltd |
| Price | Free |
| Availability | Australia only (App Store Connect > Pricing and Availability) |

Don't put other companies' names (Grays, Pickles, Trade Me, Carsales) in the keywords: Apple rejects that.

### Age rating questionnaire
Answer "None" or "No" to everything (violence, gambling, contests, unrestricted web access, user-generated content you'd need to rate, and so on). Auctions for physical goods are not gambling. Bidders must be 18+, which the app enforces with ID checks.

### App Privacy ("nutrition label")
"Do you or your third-party partners collect data from this app?" **Yes.** Tracking: **No** (no advertising, no data brokers, no cross-app tracking). For each type below: **Linked to the user: Yes. Used for tracking: No.**

| Data type | Purposes |
|---|---|
| Contact info: Name | App Functionality |
| Contact info: Email address | App Functionality |
| Contact info: Phone number | App Functionality |
| Contact info: Physical address | App Functionality |
| Financial info: Payment info | App Functionality (cards are entered into Stripe's secure form; we keep the brand and last 4 digits) |
| Purchases: Purchase history | App Functionality |
| User content: Photos or videos | App Functionality (appraisal and claim photos, only when you choose them) |
| User content: Customer support | App Functionality |
| Identifiers: User ID | App Functionality |
| Identifiers: Device ID | App Functionality (the push notification token) |
| Other data types: Date of birth and identity document check | App Functionality (ID verification before bidding) |

Not collected: location, contacts, browsing or search history, health, diagnostics, usage analytics, advertising data.

### App Review information
- **Sign-in required:** Yes. Demo account: the `appreview@tyrebiter.com.au` account you create in step 9 of the README, and its password.
- **Contact:** your name, mobile and email.
- **Notes** (paste and fill in the blanks):

```
Tyrebiter is an online auction marketplace for physical vehicles (cars, utes, trucks, motorbikes, caravans, boats and machinery) sold on behalf of their owners in Australia. Winning bidders pay for the vehicle itself, a physical good, so payments use Stripe rather than in-app purchase (guideline 3.1.3(e)).

Demo account: [email] / [password]. It has its mobile and ID already verified so you can browse, search, watch vehicles, save searches, set alerts and see the bid screen. It has no payment card, so tapping a bid button leads to "Add a payment card". Bids are legally binding for real vehicles, so please don't add a real card and bid.

- Account deletion: Account tab, scroll to the bottom, "Delete my account" (guideline 5.1.1(v)).
- Push notifications are optional; we ask the first time you watch a vehicle, bid or save a search.
- The camera and photo library are used only when you choose to add photos to a free appraisal (Sell tab) or to a claim on a purchase.
- No sign-in with third-party accounts is offered, so Sign in with Apple doesn't apply.
```

---

## Google Play Console (Android)

| Field | Text |
|---|---|
| App name [30] | Tyrebiter: Vehicle Auctions |
| Short description [80] | Live vehicle auctions Australia-wide: cars, utes, trucks, bikes and boats. |
| Full description [4000] | The long description above |
| App category | Auto & Vehicles |
| Tags | Auctions, Cars, Shopping |
| Contains ads | No |
| Countries | Australia |

### App content (Policy > App content)
- **Privacy policy:** https://tyrebiter.com.au/privacy
- **App access:** "All or some functionality is restricted". Add the demo account (same as Apple) with the instruction "Sign in from the Account tab. Bids are binding, so please don't add a real card."
- **Ads:** No.
- **Content rating (IARC questionnaire):** category "All other app types". Answer No to violence, sexuality, language, controlled substances, gambling and crude humour. "Can users interact or exchange content?": **Yes** (members can ask public questions on a listing, which we moderate). "Does the app share the user's location?": No. "Does the app allow purchases of digital goods?": No (physical vehicles).
- **Target audience:** 18 and over only.
- **News app:** No. **Health:** No. **Government app:** No. **Financial features:** "My app doesn't provide any financial features" (it takes card payments for vehicles but is not a financial product).
- **Data deletion:** "Users can request that data is deleted" (in the app, and on the web at https://tyrebiter.com.au/delete-account).

### Data safety
- Collects or shares user data: **Yes, collects.** Shares with third parties: **No** (Stripe, Twilio and Resend process data on our behalf, which Google counts as service providers, not sharing).
- Encrypted in transit: **Yes.** Users can request deletion: **Yes.**

| Data type | Collected | Optional? | Purposes |
|---|---|---|---|
| Personal info: Name | Yes | Required | Account management, App functionality |
| Personal info: Email address | Yes | Required | Account management, App functionality |
| Personal info: Phone number | Yes | Required | Account management, Fraud prevention, security and compliance |
| Personal info: Address | Yes | Required | App functionality |
| Personal info: Other info (date of birth, ID check result) | Yes | Required | Fraud prevention, security and compliance |
| Financial info: User payment info | Yes | Required | App functionality |
| Financial info: Purchase history | Yes | Required | App functionality |
| Photos and videos: Photos | Yes | Optional | App functionality |
| App activity: Other user-generated content (questions, claims) | Yes | Optional | App functionality |
| Device or other IDs (push token) | Yes | Optional | App functionality |

Not collected: location, contacts, calendar, messages, audio, files, web history, health, app interactions or analytics, crash logs.
