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

Tyrebiter runs live online auctions for cars, utes, 4x4s, vans, trucks, trailers, buses, motorbikes, caravans, boats and machinery right across Australia. Every vehicle is professionally photographed and PPSR searched, with a graded condition report and close-up photos of damage and wear.

SEARCH THE WAY YOU TALK
Type "HiLux under 30k in QLD", "LAMS bike" or "caravan sleeps 4" and we work out the make, price, state and features for you. Filter by category, make, model, year, price, kilometres or hours, fuel, transmission, licence class and more. Save a search and we'll tell you the moment a match is listed.

KNOW THE ALL-IN PRICE BEFORE YOU BID
Every lot shows what you'd pay if you win: the bid, the buyer's premium, GST and the admin fee, added up. No card surcharge.

INDEPENDENT MOBILE INSPECTIONS
Order an inspection from the listing. An independent mobile mechanic inspects the vehicle where it is and sends you a written report with photos before you bid. Questions? Call or email the consultant named on the listing.

WATCH THE VIDEOS
Listings can include walkaround, cold start and interior videos, checked by our team before they appear. Play them full screen in the app.

FINANCE AND INSURANCE
Eligible listings show estimated weekly repayments and a comparison rate. Compare car loans and insurance from our partners before you bid or collect. Estimates only, not an offer of credit.

BID IN SECONDS
Set your maximum and we bid for you, one increment at a time, only as far as needed to keep you in front. Bids in the last 10 minutes add 10 minutes, so nobody wins by sniping.

PRIVATE BIDDING
Bidder names are blurred in the bid history. Everyone sees the amounts and times, never who placed them.

NEVER MISS THE FINISH
Watch vehicles and get a push alert when you're outbid, when an auction is about to end and when you win. Choose push, SMS or email for each kind of alert.

PAY, BOOK PICKUP, COLLECT
When you win, your tax invoice is in the app and your saved card is charged. Book a collection time, get the address once it's confirmed, and show your release code when you pick the vehicle up.

SELLING WITH TYREBITER
Get a free appraisal with photos from your phone. We photograph and inspect the vehicle at your place and auction it to buyers Australia-wide. Buyers don't come to view it: inspections are done by an independent mobile mechanic. Add videos to your listing, follow every bid, watcher and view, and if bidding ends below your reserve, accept or decline from the app.

SAFE BY DESIGN
Every bidder verifies their mobile, card and ID before bidding. We never ask you to pay a seller directly, and our bank details never change by email or SMS.

Tyrebiter Pty Ltd sells as agent for the owner. You must be 18 or over to bid.
```

---

## App Store Connect (iPhone)

| Field | Text |
|---|---|
| Subtitle [30] | Cars, utes, trucks and more |
| Promotional text [170] | Live vehicle auctions Australia-wide. See the all-in price, order an independent mobile inspection, get outbid alerts, and pay and book pickup in the app. |
| Keywords [100] | car auction,ute,4x4,truck,motorbike,caravan,boat,machinery,used cars,bid,trailer,vehicle,auctions |
| Primary category | Shopping |
| Secondary category | Lifestyle |
| Copyright | 2026 Tyrebiter Pty Ltd |
| Price | Free |
| Availability | Australia only (App Store Connect > Pricing and Availability) |

Don't put other companies' names (Grays, Pickles, Trade Me, Carsales) in the keywords: Apple rejects that.

### Age rating questionnaire
Answer "None" or "No" to everything (violence, gambling, contests, unrestricted web access, user-generated content you'd need to rate, and so on). Auctions for physical goods are not gambling. Bidders must be 18+, which the app enforces with ID checks. Listing questions and seller videos only appear after our team approves them.

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
| User content: Photos or videos | App Functionality (appraisal and claim photos, and videos sellers add to their own listing, only when you choose them) |
| User content: Customer support | App Functionality |
| Identifiers: User ID | App Functionality |
| Identifiers: Device ID | App Functionality (the push notification token) |
| Other data types: Date of birth and identity document check | App Functionality (ID verification before bidding) |

Not collected: location, contacts, browsing or search history, health, diagnostics, usage analytics, advertising data.

Partner enquiries: when someone orders a mobile inspection, the app sends their name, email, phone and (optional) postcode to the named inspection company, only after they tick the consent box. Finance and insurance enquiries are made on the website pages the app opens. Apple counts this under the contact info types already declared above (App Functionality), so nothing extra is ticked. Tracking stays **No**: the details aren't used for advertising or passed to data brokers.

### App Review information
- **Sign-in required:** Yes. Demo account: the `appreview@tyrebiter.com.au` account you create in step 9 of the README, and its password.
- **Contact:** your name, mobile and email.
- **Notes** (paste and fill in the blanks):

```
Tyrebiter is an online auction marketplace for physical vehicles (cars, utes, trucks, motorbikes, caravans, boats and machinery) in Australia. Winning bidders pay for the vehicle itself, a physical good, so payments use Stripe rather than in-app purchase (guideline 3.1.3(e)).

Demo account: [email] / [password]. It has its mobile and ID already verified so you can browse, search, watch vehicles, save searches, set alerts and see the bid screen. It has no payment card, so tapping a bid button leads to "Add a payment card". Bids are legally binding for real vehicles, so please don't add a real card and bid.

- Account deletion: Account tab, scroll to the bottom, "Delete my account" (guideline 5.1.1(v)).
- Push notifications are optional; we ask the first time you watch a vehicle, bid or save a search.
- The camera and photo library are used only when you choose to add photos to a free appraisal (Sell tab) or to a claim on a purchase. Sellers can also choose a video from the library for their own listing (Sell tab, after a listing exists; the demo account has none). No microphone access is requested.
- There are no in-person inspections. "Order a mobile inspection" on a listing sends a real enquiry to an independent inspection company, so it's only open to fully verified members (mobile, card and ID). The demo account has no card, so it will be asked to finish verifying; that's expected.
- "Compare car loans" and "Compare insurance" open our website in an in-app browser. Tyrebiter doesn't lend money or sell insurance in the app.
- Bidder names in the bid history are blurred on purpose, for privacy. It isn't a display fault.
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
- **App access:** "All or some functionality is restricted". Add the demo account (same as Apple) with the instruction "Sign in from the Account tab. Bids are binding, so please don't add a real card. The 'Order a mobile inspection' form on a listing sends a real enquiry to an inspection company, so please don't submit it (or write 'App Review test' in the notes)."
- **Ads:** No.
- **Content rating (IARC questionnaire):** category "All other app types". Answer No to violence, sexuality, language, controlled substances, gambling and crude humour. "Can users interact or exchange content?": **Yes** (members can ask public questions on a listing, and sellers can add videos to their listing; we moderate both before they appear). "Does the app share the user's location?": No. "Does the app allow purchases of digital goods?": No (physical vehicles).
- **Target audience:** 18 and over only.
- **News app:** No. **Health:** No. **Government app:** No. **Financial features:** "My app doesn't provide any financial features" (it takes card payments for vehicles but is not a financial product). Some listings show an estimated weekly repayment, and "Compare car loans" and "Compare insurance" open the website's comparison pages in the browser. The app doesn't lend, broker credit or sell insurance, and no finance or insurance enquiry is sent from inside the app. If finance or insurance enquiry forms are ever added inside the app, revisit this answer (Google's personal loan rules would then apply).
- **Data deletion:** "Users can request that data is deleted" (in the app, and on the web at https://tyrebiter.com.au/delete-account).

### Data safety
- Collects or shares user data: **Yes, collects and shares.** Stripe, Twilio and Resend process data for us, which Google counts as service providers, not sharing.
- Shares with third parties: **Yes**, for partner enquiries. When someone asks a mobile inspection, finance or insurance partner to contact them (inspections from the app, finance and insurance on the website pages it opens), we pass their name, email, phone and postcode to that named partner, only after they tick a consent box. Google says transfers the user starts themselves, and expects, may not count as sharing. We declare it anyway, because a partner is a separate business that uses the details to contact the person, and over-declaring is safer than a policy strike.
- Encrypted in transit: **Yes.** Users can request deletion: **Yes.**

| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| Personal info: Name | Yes | Yes, with inspection, finance and insurance partners at the user's request | Required | Account management, App functionality |
| Personal info: Email address | Yes | Yes, as above | Required | Account management, App functionality |
| Personal info: Phone number | Yes | Yes, as above | Required | Account management, Fraud prevention, security and compliance |
| Personal info: Address | Yes | Yes, postcode only, as above | Required | App functionality |
| Personal info: Other info (date of birth, ID check result) | Yes | No | Required | Fraud prevention, security and compliance |
| Financial info: User payment info | Yes | No | Required | App functionality |
| Financial info: Purchase history | Yes | No | Required | App functionality |
| Photos and videos: Photos | Yes | No | Optional | App functionality |
| Photos and videos: Videos (sellers' listing videos) | Yes | No | Optional | App functionality |
| App activity: Other user-generated content (questions, claims) | Yes | No | Optional | App functionality |
| Device or other IDs (push token) | Yes | No | Optional | App functionality |

For the "Shared" rows, the sharing purpose is **App functionality** (the partner contacts the person about the inspection, loan or policy they asked about).

Not collected: location, contacts, calendar, messages, audio, files, web history, health, app interactions or analytics, crash logs.
