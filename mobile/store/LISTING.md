# Super Trucker: store listing copy and answers

Everything to paste into App Store Connect and Google Play Console. Character limits are in brackets; every field below fits.

Images in this folder:
- `screenshots/iphone/01.png` to `07.png`: 1290 × 2796, for the iPhone 6.9" slot (App Store Connect scales them down for smaller iPhones).
- `screenshots/android/01.png` to `07.png`: 1080 × 1920, for Google Play phone screenshots.
- `play-feature-graphic.png`: 1024 × 500, the Google Play feature graphic.
- `play-icon-512.png`: 512 × 512, the Google Play app icon. (The App Store takes the icon from the app itself.)

The seven, in order: the home page (trucks, sold live), the live auction room (bid live, from anywhere), a listing's
estimate with its all-in price, a truck's specifications, the two ways to inspect it, plain-English search, and selling.

They were made from the sample trucks, which have no photos, so each truck shows our drawn outline. Before you submit,
remake them once your first real trucks are listed with their owners' photos: ask Claude Code to "recapture the store
screenshots". The tools are `tools/capture.mjs` (the app's screens, from its web build) and `tools/compose.mjs` (the
frames, words and feature graphic); the instructions are at the top of each.

---

## Both stores

The site is still on tyrebiter.com.au. When the Super Trucker domain is live (`NEXT_PUBLIC_SITE_URL`, `EMAIL_FROM`,
`NEXT_PUBLIC_SUPPORT_EMAIL`), use it in every link and email below, and make the App Store support email an address on
that domain.

| Field | Text |
|---|---|
| App name [30] | Super Trucker: Truck Auctions |
| Website | https://tyrebiter.com.au |
| Support / contact | https://tyrebiter.com.au/contact |
| Privacy policy | https://tyrebiter.com.au/privacy |
| Account deletion page | https://tyrebiter.com.au/delete-account |
| Support email | help@tyrebiter.com.au (whatever NEXT_PUBLIC_SUPPORT_EMAIL is) |

### Long description [4000]

```
Trucks, sold live.

Super Trucker runs live online auctions for trucks: prime movers, tippers, rigids, curtainsiders, pantechs, tray tops, cab chassis and more. Every truck is offered by a licensed auctioneer in a live online auction, and every listing has an auction estimate, the owner's photos and walkaround video (checked by our team against the papers and the registration record), a PPSR search for finance, write-offs and theft, and the details truck buyers look for.

We're selling trucks kept in Queensland to start. You can bid from anywhere.

THE DETAILS THAT MATTER
Configuration, GVM and GCM, engine and horsepower, gearbox, rear axles, brakes, suspension, cab, wheelbase, fuel capacity, body size and the features fitted, set out the way truck buyers expect.

KNOW THE ALL-IN PRICE BEFORE YOU BID
Every estimate and every bid shows what you'd pay if you win: the bid, the buyer's premium and GST, added up.

INSPECT IT FIRST, TWO WAYS
Inspect it yourself: ask for a time to look it over where it's kept. We agree it with the owner and send you the address. Or send our mobile mechanic: book from the listing, pay the fee shown once the time is agreed, and get a written report before the auction. Anything the mechanic finds goes on the listing for every bidder.

BID EARLY OR BID LIVE
Leave an early bid any time before the auction: set your maximum and we bid for you, only as far as needed to keep you in front. You can withdraw it until the hammer falls. On auction day, join the live room and bid in real time as the auctioneer sells each truck in turn.

SEARCH THE WAY YOU TALK
Type "Kenworth T610 under 150k", "Isuzu FVZ tipper under 80k" or "curtainsider 2018" and we work out the make, model, type, price and year. Save a search and we'll tell you when a match is listed.

NEVER MISS YOUR TRUCK
Watch trucks and get an alert when you're outbid, when a watched truck is about to come up in the live room, and when you win. Choose push, SMS or email for each kind of alert.

PAY, THEN COLLECT
Your tax invoice is in the app. Pay by bank transfer or PayID. We lodge the seller's side of the registration transfer, then you collect the truck from where it's kept, at a time we agree, with your release code.

FINANCE AND INSURANCE
Compare finance and insurance from our partners before you bid. Estimates only, not an offer of credit.

SELLING YOUR TRUCK
Type your rego plate and we fill in the truck. Add the kilometres, your photos and a short walkaround video from your phone. We check them against your papers and the records, agree an estimate and your reserve with you, and you sign your appointment of us, on Queensland's approved form, on your phone. Verified buyers can view it at your place by appointment: we agree every visit with you first and tell you who's coming. You can lower your reserve until the hammer falls and follow every bid in the app. The buyer pays us in full before they collect it from you.

SAFE BY DESIGN
Every bidder verifies their mobile and ID before bidding. Bidder names are hidden in the bid history. We never ask you to pay a seller directly, and our bank details never change by email or SMS.

Super Trucker sells as agent for the owner. You must be 18 or over to bid.
```

---

## App Store Connect (iPhone)

| Field | Text |
|---|---|
| Subtitle [30] | Live truck auctions in QLD |
| Promotional text [170] | Live truck auctions with an estimate and the all-in price on every listing. Inspect it yourself or send our mobile mechanic, then bid early or bid live. |
| Keywords [100] | truck auction,prime mover,tipper,trucks,curtainsider,rigid,used trucks,pantech,cab chassis,bid |
| Primary category | Shopping |
| Secondary category | Business |
| Copyright | 2026 Super Trucker Pty Ltd (the company's legal name, once it's registered) |
| Price | Free |
| Availability | Australia only (App Store Connect > Pricing and Availability) |

Don't put other companies' names (Grays, Pickles, Manheim, Truckdealers, Trade Me) or truck makers' brand names in the
keywords: Apple rejects names that aren't yours.

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
| User content: Photos or videos | App Functionality (photos of a truck to sell, transfer documents, claim photos, and the video a seller adds to their own listing, only when you choose them) |
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
| Usage Data: Product Interaction | Analytics (which screens are opened, and which truck) |
| Usage Data: Other Usage Data | Analytics (the search *filters* applied and how many trucks matched — never the words typed into the search box, which the app strips before sending) |
| Diagnostics: Crash Data | App Functionality (an unhandled error's type, message, stack and screen, with personal details removed before anything is stored) |
| Diagnostics: Other Diagnostic Data | App Functionality (the app version an error came from) |
| Location: Coarse Location | Analytics (country and state only, worked out by our host from the connection; the app never asks for or reads the device's location) |

Not collected: precise location, contacts, calendar, messages, audio, files, health, fitness, browsing history, search
terms typed by the user, purchase advertising data, or any advertising or third-party analytics identifier. No
advertising SDK, no third-party analytics SDK, and no cross-app or cross-site tracking of any kind.

Viewings, inspections and partners: when a member asks to inspect a truck themselves, our staff agree a time with its
owner; the owner is then given the member's name (the member agrees to that when booking) and the member the address.
A booking for our own mobile mechanic stays with Super Trucker: the owner is told the time, never the member's name.
Finance and insurance enquiries are made on the website pages the app opens, and send a partner the person's name,
email, phone and postcode only after they tick a consent box. Apple counts all of this under the contact info types
already declared above (App Functionality), so nothing extra is ticked. Tracking stays **No**: none of it is used for
advertising or passed to data brokers.

### App Review information
- **Sign-in required:** Yes. Demo account: the `appreview@tyrebiter.com.au` account you create in step 9 of the README, and its password.
- **Contact:** your name, mobile and email.
- **Notes** (paste and fill in the blanks):

```
Super Trucker is an online live auction marketplace for trucks (physical vehicles) kept in Queensland, Australia. Winning bidders pay for the truck itself, a physical good, by bank transfer outside the app, so in-app purchase doesn't apply (guideline 3.1.3(e)).

Demo account: [email] / [password]. Its mobile is verified so you can browse, search, watch trucks, save searches, set alerts, open the live auction room and see the bid screen. Its ID isn't verified, so tapping a bid button leads to the ID check. Bids are legally binding for real trucks, so please don't complete an ID check and bid.

- Account deletion: Account tab, scroll to the bottom, "Delete my account" (guideline 5.1.1(v)).
- Push notifications are optional; we ask the first time you watch a truck, bid or save a search.
- The camera and photo library are used only when you choose to add photos of a truck to sell (Sell tab), a transfer document or a claim on a purchase (invoice screen). Sellers can also choose a video from the library for their own listing (Sell tab, after a listing exists; the demo account has none). No microphone access is requested.
- A listing offers two ways to inspect a truck. "Inspect it yourself" asks our staff to arrange a time to look at it where it's kept (in person, arranged by us, never a direct meet-up between strangers). "Send our mobile mechanic" books a paid inspection by Super Trucker's own mechanic, paid by bank transfer outside the app once a time is agreed. Both are real requests, so they're open only to fully verified members (mobile and ID); the demo account will be asked to finish verifying, which is expected.
- "Compare finance" and "Compare insurance" open our website in an in-app browser. Super Trucker doesn't lend money or sell insurance in the app.
- Bidder names in the bid history are blurred on purpose, for privacy. It isn't a display fault.
- Some listings show "No cooling-off period applies" or "No cooling-off period—sale on consignment" near the price. That is wording Queensland law requires for a vehicle sold on consignment (Motor Dealers and Chattel Auctioneers Regulation 2014 (Qld) s 9); it isn't a term we chose.
- Sellers sign their appointment of us on Queensland's approved form (Form 9) on our website. The Sell tab shows its term, their signed copy (a PDF) and a button to end it with 30 days' written notice, which Queensland law gives both sides. The demo account has no listings, so the Sell tab shows how selling works.
- Analytics are our own: the app counts screens opened and the search filters used, and reports crashes, to our own server. There is no advertising or third-party analytics SDK in the app.
- No sign-in with third-party accounts is offered, so Sign in with Apple doesn't apply.
```

---

## Google Play Console (Android)

| Field | Text |
|---|---|
| App name [30] | Super Trucker: Truck Auctions |
| Short description [80] | Live truck auctions: prime movers, tippers and rigids, with the all-in price. |
| Full description [4000] | The long description above |
| App category | Auto & Vehicles |
| Tags | Auctions, Trucks, Shopping |
| Contains ads | No |
| Countries | Australia |

### App content (Policy > App content)
- **Privacy policy:** https://tyrebiter.com.au/privacy
- **App access:** "All or some functionality is restricted". Add the demo account (same as Apple) with the instruction "Sign in from the Account tab. Bids are binding, so please don't complete the ID check. 'Inspect it yourself' and 'Send our mobile mechanic' on a listing send real requests to our staff, so please don't submit them (or write 'App Review test' in the note)."
- **Ads:** No.
- **Content rating (IARC questionnaire):** category "All other app types". Answer No to violence, sexuality, language, controlled substances, gambling and crude humour. "Can users interact or exchange content?": **Yes** (members can ask public questions on a listing, and sellers add photos and a video to their listing; we check both before they appear). "Does the app share the user's location?": No. "Does the app allow purchases of digital goods?": No (physical trucks).
- **Target audience:** 18 and over only.
- **News app:** No. **Health:** No. **Government app:** No. **Financial features:** "My app doesn't provide any financial features" (buyers pay for trucks by bank transfer outside the app; it is not a financial product). Some listings show an estimated weekly repayment, and "Compare finance" and "Compare insurance" open the website's comparison pages in the browser. The app doesn't lend, broker credit or sell insurance, and no finance or insurance enquiry is sent from inside the app. If finance or insurance enquiry forms are ever added inside the app, revisit this answer (Google's personal loan rules would then apply).
- **Data deletion:** "Users can request that data is deleted" (in the app, and on the web at https://tyrebiter.com.au/delete-account).

### Data safety
- Collects or shares user data: **Yes, collects and shares.** Stripe, Twilio and Resend process data for us, which Google counts as service providers, not sharing.
- Shares with third parties: **Yes**, for partner enquiries and viewings. When someone asks a finance or insurance partner to contact them (on the website pages the app opens), we pass their name, email, phone and postcode to that named partner, only after they tick a consent box. When a member's request to inspect a truck themselves is confirmed, its owner is given the member's name (the member agrees to that when they ask). Google says transfers the user starts themselves, and expects, may not count as sharing. We declare it anyway, because a partner is a separate business that uses the details to contact the person, and over-declaring is safer than a policy strike.
- Encrypted in transit: **Yes.** Users can request deletion: **Yes.**

| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| Personal info: Name | Yes | Yes, with finance and insurance partners at the user's request, and with a truck's owner for a confirmed viewing | Required | Account management, App functionality |
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
| App activity: App interactions (screens opened, and which truck) | Yes | No | Required | Analytics |
| App activity: In-app search history (the *filters* applied and how many trucks matched; the words typed into the search box are stripped before sending and never stored) | Yes | No | Required | Analytics |
| App info and performance: Crash logs (an unhandled error's type, message, stack and screen, with personal details removed before storage) | Yes | No | Required | Analytics, App functionality |
| App info and performance: Other app performance data (the app version an error came from) | Yes | No | Required | App functionality |
| Location: Approximate location (country and state only, worked out by our host from the connection; the app never asks for or reads the device's location) | Yes | No | Required | Analytics |

For the "Shared" rows, the sharing purpose is **App functionality** (the partner contacts the person about the loan or policy they asked about; the owner knows who is coming to see their truck).

The last five rows are Super Trucker's own first-party counter (`POST /api/t` → `web_events`) and crash reporting
(`POST /api/errors`). They are marked **Required** because the app sends them without a toggle, and **not** processed
ephemerally (rows are kept for 90 days, then deleted; only daily totals remain). No account id or sign-in token goes
with them: a visit is counted under an anonymous code rebuilt from the connection and the day, and the only thing said
about the person is whether they were signed in. There is no advertising SDK and no third-party analytics SDK, so
"Data is encrypted in transit: Yes" and "Users can request data deletion: Yes" both stay as they are.

Not collected: precise location, contacts, calendar, messages, audio, music, files or documents, web browsing history,
health and fitness, SMS or call logs, installed apps, or any advertising ID.
