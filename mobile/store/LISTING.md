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

Tyrebiter runs live online auctions for cars, utes, 4x4s, vans, trucks, trailers, buses, motorbikes, caravans, boats and machinery right across Australia. Every vehicle is offered in a live auction with an auctioneer, and every listing has an auction estimate, the seller's photos and walkaround video (checked by our team against the papers and records), a condition report and a PPSR search for finance, write-offs and theft.

SEARCH THE WAY YOU TALK
Type "HiLux under 30k in QLD", "LAMS bike" or "caravan sleeps 4" and we work out the make, price, state and features for you. Filter by category, make, model, year, price, kilometres or hours, fuel, transmission, licence class and more. Save a search and we'll tell you the moment a match is listed.

KNOW THE ALL-IN PRICE BEFORE YOU BID
Every estimate and every bid shows what you'd pay if you win: the bid, the buyer's premium (including transport to our depot), GST and the admin fee, added up. No card surcharge.

BID EARLY OR BID LIVE
Leave an early bid any time before the auction: set your maximum and we bid for you, one increment at a time, only as far as needed to keep you in front. Changed your mind? You can withdraw it until the hammer falls. On auction day, join the live room and bid in real time while the auctioneer sells each vehicle in turn.

INDEPENDENT MECHANICAL INSPECTIONS
Order an inspection from the listing and our partner mechanic sends you a written report before you bid. Questions? Call or email the consultant named on the listing.

WATCH THE VIDEOS
Each listing has up to 10 photos and a walkaround video, taken by the seller and checked by our team before it appears. Play it full screen in the app.

FINANCE AND INSURANCE
Eligible listings show estimated weekly repayments and a comparison rate. Compare car loans and insurance from our partners before you bid or collect. Estimates only, not an offer of credit.

PRIVATE BIDDING
Bidder names are blurred in the bid history. Everyone sees the amounts and times, never who placed them.

NEVER MISS YOUR VEHICLE
Watch vehicles and get a push alert when you're outbid, when a watched vehicle is about to come up in the live auction and when you win. Choose push, SMS or email for each kind of alert.

PAY, THEN COLLECT FROM OUR DEPOT
When you win, your tax invoice is in the app. Pay by bank transfer, PayID or BPAY. Our transport partner brings the vehicle to our depot; book a collection time and show your release code when you pick it up.

SELLING WITH TYREBITER
Type your rego plate and we fill in the vehicle; add the kilometres, your photos and a walkaround video from your phone. We check them against your papers and the records, agree an auction estimate and reserve with you, and offer it in our next live auction to buyers Australia-wide. Nobody visits: buyers never come to your place and never get your name or address. You can lower your reserve until the hammer falls, and follow every bid and watcher in the app. If it doesn't reach your reserve it goes into the next auction automatically, and where the law allows it your consultant can offer it to someone who bid or watched, at a price you agree first.

SAFE BY DESIGN
Every bidder verifies their mobile and ID before bidding. We never ask you to pay a seller directly, and our bank details never change by email or SMS.

Tyrebiter Pty Ltd sells as agent for the owner. You must be 18 or over to bid.
```

---

## App Store Connect (iPhone)

| Field | Text |
|---|---|
| Subtitle [30] | Cars, utes, trucks and more |
| Promotional text [170] | Live vehicle auctions Australia-wide. An estimate and the all-in price on every listing. Bid early or bid live, and get an alert before your vehicle is up. |
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
"Do you or your third-party partners collect data from this app?" **Yes.** Tracking: **No** (no advertising, no data brokers, no cross-app tracking). Nothing below is used for tracking.

**Linked to the user** — tied to the account:

| Data type | Purposes |
|---|---|
| Contact info: Name | App Functionality |
| Contact info: Email address | App Functionality |
| Contact info: Phone number | App Functionality |
| Contact info: Physical address | App Functionality |
| Financial info: Payment info | App Functionality (no card numbers: buyers pay by bank transfer outside the app; we keep the name and bank account a payment came from, only to refund to the same account) |
| Purchases: Purchase history | App Functionality |
| User content: Photos or videos | App Functionality (photos of a vehicle to sell, transfer documents, claim photos, and the video a seller adds to their own listing, only when you choose them) |
| User content: Customer support | App Functionality |
| Identifiers: User ID | App Functionality |
| Identifiers: Device ID | App Functionality (the push notification token) |
| Other data types: Date of birth and identity document check | App Functionality (ID verification before bidding) |

**Not linked to the user** — the app's own first-party counter (`POST /api/t` → `web_events`) and crash reports
(`POST /api/errors`). Neither carries a sign-in token or an account id: a visit is counted under an anonymous code
rebuilt from the connection and the day, which changes daily, and the only thing said about the person is whether they
were signed in (a yes/no, never which account). Detailed rows are deleted after 90 days. Declare each of these as
**Linked to the user: No. Used for tracking: No.**

| Data type | Purposes |
|---|---|
| Usage Data: Product Interaction | Analytics (which screens are opened, and which vehicle) |
| Usage Data: Other Usage Data | Analytics (the search *filters* applied and how many vehicles matched — never the words typed into the search box, which the app strips before sending) |
| Diagnostics: Crash Data | App Functionality (an unhandled error's type, message, stack and screen, with personal details removed before anything is stored) |
| Diagnostics: Other Diagnostic Data | App Functionality (the app version an error came from) |
| Location: Coarse Location | Analytics (country and state only, worked out by our host from the connection; the app never asks for or reads the device's location) |

Not collected: precise location, contacts, calendar, messages, audio, files, health, fitness, browsing history, search
terms typed by the user, purchase advertising data, or any advertising or third-party analytics identifier. No
advertising SDK, no third-party analytics SDK, and no cross-app or cross-site tracking of any kind.

Partner enquiries: when someone orders a mobile inspection, the app sends their name, email, phone and (optional) postcode to the named inspection company, only after they tick the consent box. Finance and insurance enquiries are made on the website pages the app opens. Apple counts this under the contact info types already declared above (App Functionality), so nothing extra is ticked. Tracking stays **No**: the details aren't used for advertising or passed to data brokers.

### App Review information
- **Sign-in required:** Yes. Demo account: the `appreview@tyrebiter.com.au` account you create in step 9 of the README, and its password.
- **Contact:** your name, mobile and email.
- **Notes** (paste and fill in the blanks):

```
Tyrebiter is an online live auction marketplace for physical vehicles (cars, utes, trucks, motorbikes, caravans, boats and machinery) in Australia. Winning bidders pay for the vehicle itself, a physical good, by bank transfer outside the app, so in-app purchase doesn't apply (guideline 3.1.3(e)).

Demo account: [email] / [password]. Its mobile is verified so you can browse, search, watch vehicles, save searches, set alerts, open the live auction room and see the bid screen. Its ID isn't verified, so tapping a bid button leads to the ID check. Bids are legally binding for real vehicles, so please don't complete an ID check and bid.

- Account deletion: Account tab, scroll to the bottom, "Delete my account" (guideline 5.1.1(v)).
- Push notifications are optional; we ask the first time you watch a vehicle, bid or save a search.
- The camera and photo library are used only when you choose to add photos of a vehicle to sell (Sell tab), a transfer document or a claim on a purchase (invoice screen). Sellers can also choose a video from the library for their own listing (Sell tab, after a listing exists; the demo account has none). No microphone access is requested.
- There are no in-person viewings. "Order a mechanical inspection" on a listing sends a real enquiry to an independent inspection company, so it's only open to fully verified members (mobile and ID). The demo account hasn't verified its ID, so it will be asked to finish verifying; that's expected.
- "Compare car loans" and "Compare insurance" open our website in an in-app browser. Tyrebiter doesn't lend money or sell insurance in the app.
- Bidder names in the bid history are blurred on purpose, for privacy. It isn't a display fault.
- If a vehicle doesn't reach its reserve, we may later offer it to someone who bid on or watched it, at a price its
  owner has agreed in writing. That offer opens on the Offers screen: it shows the price, the all-in total, the state's
  cooling-off period, a contract PDF and the state's own forms, and it's signed by typing your verified name. It's a
  contract to buy a physical vehicle, paid by bank transfer outside the app, so in-app purchase doesn't apply here
  either. The demo account has no such offer, so the screen will be empty for you.
- Some listings show "No cooling-off period applies" or "No cooling-off period—sale on consignment" near the price.
  That is wording Queensland law requires us to publish for a vehicle sold on consignment for its owner (Motor Dealers
  and Chattel Auctioneers Regulation 2014 (Qld) s 9); it isn't a term we chose.
- Analytics are our own: the app counts screens opened and the search filters used, and reports crashes, to our own
  server. There is no advertising or third-party analytics SDK in the app.
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
- **App access:** "All or some functionality is restricted". Add the demo account (same as Apple) with the instruction "Sign in from the Account tab. Bids are binding, so please don't complete the ID check. The 'Order a mechanical inspection' form on a listing sends a real enquiry to an inspection company, so please don't submit it (or write 'App Review test' in the notes)."
- **Ads:** No.
- **Content rating (IARC questionnaire):** category "All other app types". Answer No to violence, sexuality, language, controlled substances, gambling and crude humour. "Can users interact or exchange content?": **Yes** (members can ask public questions on a listing, and sellers add photos and a video to their listing; we check both before they appear). "Does the app share the user's location?": No. "Does the app allow purchases of digital goods?": No (physical vehicles).
- **Target audience:** 18 and over only.
- **News app:** No. **Health:** No. **Government app:** No. **Financial features:** "My app doesn't provide any financial features" (buyers pay for vehicles by bank transfer outside the app; it is not a financial product). Some listings show an estimated weekly repayment, and "Compare car loans" and "Compare insurance" open the website's comparison pages in the browser. The app doesn't lend, broker credit or sell insurance, and no finance or insurance enquiry is sent from inside the app. If finance or insurance enquiry forms are ever added inside the app, revisit this answer (Google's personal loan rules would then apply).
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
| Financial info: User payment info (the bank account a transfer to us came from, for refunds; no card numbers) | Yes | No | Optional | App functionality |
| Financial info: Purchase history | Yes | No | Required | App functionality |
| Photos and videos: Photos | Yes | No | Optional | App functionality |
| Photos and videos: Videos (sellers' listing videos) | Yes | No | Optional | App functionality |
| App activity: Other user-generated content (questions, claims) | Yes | No | Optional | App functionality |
| Device or other IDs (push token) | Yes | No | Optional | App functionality |
| App activity: App interactions (screens opened, and which vehicle) | Yes | No | Required | Analytics |
| App activity: In-app search history (the *filters* applied and how many vehicles matched; the words typed into the search box are stripped before sending and never stored) | Yes | No | Required | Analytics |
| App info and performance: Crash logs (an unhandled error's type, message, stack and screen, with personal details removed before storage) | Yes | No | Required | Analytics, App functionality |
| App info and performance: Other app performance data (the app version an error came from) | Yes | No | Required | App functionality |
| Location: Approximate location (country and state only, worked out by our host from the connection; the app never asks for or reads the device's location) | Yes | No | Required | Analytics |

For the "Shared" rows, the sharing purpose is **App functionality** (the partner contacts the person about the inspection, loan or policy they asked about).

The last five rows are Tyrebiter's own first-party counter (`POST /api/t` → `web_events`) and crash reporting
(`POST /api/errors`). They are marked **Required** because the app sends them without a toggle, and **not** processed
ephemerally (rows are kept for 90 days, then deleted; only daily totals remain). No account id or sign-in token goes
with them: a visit is counted under an anonymous code rebuilt from the connection and the day, and the only thing said
about the person is whether they were signed in. There is no advertising SDK and no third-party analytics SDK, so
"Data is encrypted in transit: Yes" and "Users can request data deletion: Yes" both stay as they are.

Not collected: precise location, contacts, calendar, messages, audio, music, files or documents, web browsing history,
health and fitness, SMS or call logs, installed apps, or any advertising ID.
