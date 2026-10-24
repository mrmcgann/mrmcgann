# Tyrebiter: the legal basis, clause by clause

Settled 23 October 2026 from primary sources (Acts, regulations, regulators' guidance and cases). Each position below
is built into the engine (the database), the wording (`src/content/legal.ts`, `src/lib/listing.ts` and friends), or
both. If a rule changes in one place, change it in the other, and update this register.

A lawyer gives the finished set a final read before launch (late February or early March 2027). That review is a
check, not a list of open questions: nothing here is waiting on it. The business facts only Tyrebiter can supply are
listed at the end.

## The model in one paragraph

Tyrebiter (a Queensland company) sells vehicles for their owners, as their agent, only in live online auctions
conducted by a licensed auctioneer, at the fall of the hammer. Every listing has an auction estimate. Tyrebiter is never
at the vehicle: the seller supplies the photos and walkaround video, and staff check them against the registration
record, the PPSR search and the papers. Buyers never see the vehicle or learn who the seller is. After payment, a
transport partner takes the vehicle to a depot, where the buyer collects it.

## 1. Sale by auction, and the consumer guarantees

| Position | Built in | Source |
| --- | --- | --- |
| Every sale is a "sale by auction": conducted by the owner's agent, in person or electronically. | Live-only engine (migration 22); Terms s 4 | Australian Consumer Law (Sch 2, Competition and Consumer Act 2010) s 2, definition of "sale by auction" |
| The guarantees of title, undisturbed possession and no undisclosed securities (ss 51 to 53) apply to every sale; acceptable quality, fitness for purpose, description and sample (ss 54 to 59) don't apply to sales by auction. | `consumerRights()`; Terms s 4; Help | ACL ss 51 to 59 (ss 54 to 59 apply only where "the supply does not occur by way of sale by auction"); ACCC, "Auctions" guidance |
| Misleading conduct law always applies; nothing excludes non-excludable rights. | Terms ss 4, 13; Website terms s 1 | ACL ss 18, 29, 64 |
| No Buy Now, tenders, offers after the auction, referrals or second-chance offers, so no sale ever falls outside "sale by auction" (and Victoria's consignment ban, below). A vehicle passed in tells its highest bidder that one of our consultants will be in touch; the call is about the vehicle’s next auction (a lower reserve, an early bid), never a sale outside one. | `buy_now`, `make_offer`, `seller_decide`, `admin_accept`, `admin_offer_next_bidder`, `respond_second_chance` refuse; `close_one_lot` passes in below the reserve; `queue_status_notices`, `queue_passed_followup` | ACL s 2; Motor Car Traders Act 1986 (Vic), CAV "Motor car auction house guidelines" |
| No cooling-off period. | Terms summary, s 4 | Qld: "Buying at auction" (no cooling-off at auction); ACT Sale of Motor Vehicles Act 1977 s 25B(7); CAV auction guidance |

## 2. Auction rules (Sale of Goods Acts and auctioneer regulation)

| Position | Built in | Source |
| --- | --- | --- |
| Each lot is a separate contract, made at the fall of the hammer. | `close_one_lot` (sold only when the countdown ends or the auctioneer knocks it down); `admin_live_due` knocks it down only once the countdown has really run out, so a bid in the last seconds keeps it open | Sale of Goods Act 1923 (NSW) s 60(1)(a)-(b); Sale of Goods Act 1896 (Qld) s 59 and the other states' equivalents |
| A bidder may retract a bid until the hammer falls: early bids can be withdrawn until the vehicle is offered, live bids until the countdown ends; the price is recalculated as if the bid was never made. | `withdraw_bid()`, `remove_bids_core()`; BidPanel and live room buttons; Terms s 6 | SGA (NSW) s 60(1)(b) ("any bidder may retract his or her bid") |
| No seller bids, and the auctioneer never bids for the seller (no vendor bids at all). | `bid_guard` (seller and their mobile blocked); no vendor-bid function exists; Terms s 6, agreement s 5 | SGA (NSW) s 60(1)(c)-(d); MDCA Regulation 2014 (Qld) s 29; CAV guidance (owner can't bid; dummy bidding banned) |
| Only registered (verified) bidders can bid, and bidders are told so. | `bid_gate`; live room rules text | MDCA Regulation 2014 (Qld) s 28(2) |
| The auctioneer's name is displayed for the whole auction; a live auction can't start without it. | `admin_live_start`, `live_sweep` (auctioneer required); live room pill | MDCA Regulation 2014 (Qld) s 12 |
| Before bidding in the live room, every bidder reads the auction’s conditions (the key points of the Terms of Sale, in plain words, each linked to its section) and ticks to accept them; we record who accepted, when and which version of the terms, and a bid in the room isn’t taken without it. On the listing, every bid has its own confirm step with the as is, where is acknowledgement. | `src/lib/conditions.ts`; `enter_sale()`, `sale_entries`, `place_bid` (`enter_first`); BidConfirm; Terms s 6 | Terms that aren’t brought to a party’s notice before the contract is made don’t bind them: Oceanic Sun Line Special Shipping Co Inc v Fay (1988) 165 CLR 197; ACL s 24(3) (a term is transparent if it is in reasonably plain language, legible, presented clearly and readily available) |
| The auction never starts before its published start time: bidders plan around it, and the Terms promise it. | `admin_live_start` refuses before `starts_at`; the clock (`live_sweep`) starts it then; Terms s 6 | Terms s 6 (the contract with registered bidders); ACL s 18 (misleading or deceptive conduct) |
| The buyer's premium is agreed by the seller in writing, stated in every written advertisement for the auction, displayed to each person bidding online during the auction. | Seller agreement s 3; LotCard terms line, listing notice, live room terms line; Terms s 7 | MDCA Regulation 2014 (Qld) s 6; Qld "Buying at auction" |
| The reserve is recorded (the store book); the seller's instructions (lowering it) are followed and recorded. | `lot_private.reserve_price`, `seller_decisions` (lower_reserve/remove_reserve, via portal or admin) | MDCA Regulation 2014 (Qld) ss 14(2)(c), 24(1) |

## 3. The auction estimate

| Position | Built in | Source |
| --- | --- | --- |
| An estimate is a representation about a future matter: it needs reasonable grounds, and without evidence of them it's taken to be misleading. So every estimate has a written basis on file (comparable sales, price guides, condition), with who wrote it and when. | `lot_private.estimate_basis/by/at`; publish check needs 20+ characters | ACL s 4(1)-(2) |
| The reserve is never above the low estimate (otherwise the estimate would mislead). The range is at most 25% wide (or $1,000), so it means something. | `reserve_within_estimate` / `estimate_above_reserve` triggers; `lots_estimate_range` check; `estimateProblem()` | ACL ss 4, 18, 29(1)(i) (false or misleading representations about price) |
| A changed estimate on a listed vehicle is a correction: shown, bidders and watchers told, not offered for 24 hours. | `lot_corrections_log` (estimate fields), `live_advance` 24-hour hold | ACL s 18 |
| A vehicle passed in and relisted gets a fresh estimate with fresh grounds: the old one (which bidding didn't reach) isn't carried over. | `admin_relist` (estimate and its basis left out) | ACL s 4 |
| The all-in amount is shown beside every estimate and bid, at least as prominently. | LotCard, BidPanel, live room, home page, compare, watchlist and the app's equivalents (same size and weight) | ACL s 48 (single price; s 48(5) prominence) |

## 4. Remote checking (we're never at the vehicle)

| Position | Built in | Source |
| --- | --- | --- |
| Seller-supplied content (photos, video, declarations, reports) is labelled as the seller's and passed on without being adopted; "checked by Tyrebiter" is used only for what staff check (the photos against the records and each other). | `LISTING_CHECKS`, `REMOTE_REPORT`, `PHOTO_CHECK`, listing legend; Terms s 3 | Butcher v Lachlan Elder Realty Pty Ltd [2004] HCA 60 (an agent that merely passes on the principal's information, without adopting it and saying so, isn't misleading) |
| The seller warrants the photos and video are of this vehicle, recent (14 days), unedited, and show known damage. | Seller agreement s 6; `SELLER_ACKS.video`; `PHOTO_RULES` | Contract (indemnity, s 11); supports Tyrebiter's reasonable reliance under ACL s 18 |
| Photos copied from the sell form are stripped of EXIF/GPS/XMP/IPTC on the server; videos have their recorded place blanked. | `stripImageMetadata`, `copySellerPhotos`, `blankLocation` | Privacy Act 1988 (APP 11 security, where it applies); Privacy and Other Legislation Amendment Act 2024 (statutory tort for serious invasions of privacy, from 10 June 2025) |
| The Grays case: listed facts (year, transmission, features, damage, warning lights) must be right. | Eleven listing checks, publish gate | ACCC v GraysOnline (Federal Court, 2024, $10 million penalty) |

## 5. Licensing and consignment, state by state

| State | Position | Source |
| --- | --- | --- |
| Queensland | Motor dealer licence (corporation) plus a chattel auctioneer licence held by the employee who conducts the auctions; a corporation motor dealer may sell used vehicles by auction if the auction is conducted by its employed licensed chattel auctioneer. Trust account for consignment money (deposit by the end of the next business day). | Motor Dealers and Chattel Auctioneers Act 2014 (Qld) ss 14, 40(2); Agents Financial Administration Act 2014 (Qld) ss 16, 22 |
| New South Wales | Motor dealer licence (notify Fair Trading of online-only trading; licence number on the website and ads); written consignment agreement (names, addresses, licence numbers, vehicle, loan details, agreed price, payment directions, consignment period); trust account; Form 11 auction notice that dealer guarantees don't apply; PPSR search number on the sales notice. | Motor Dealers and Repairers Act 2013 (NSW) and Regulation; NSW Government "Working as a motor dealer" and "Required forms for motor dealers" |
| Victoria | LMCT endorsed for auction sales. Retail consignment selling is prohibited, but consigned vehicles may be sold at public auction (fall of the hammer, public able to bid): so nothing is sold after the auction. Dealings book records owner and buyer. | Motor Car Traders Act 1986 (Vic); CAV "Motor car auction house guidelines" |
| Western Australia | Dealer licence covering auction; consignment approval; written, signed consignment agreement; trust account before accepting consignments, proceeds banked by the next day; licence number in every advertisement. | Motor Vehicle Dealers Act 1973 (WA) ss 5, 5A, 21, 32A-32D, 32I; Consumer Protection WA "Consignment selling" |
| South Australia | Second-hand vehicle dealer licence; Form 11 auction notice; Form 13 notice to the purchaser. | Second-hand Vehicle Dealers Act 1995 (SA) ss 7, 20, 23(3); CBS forms |
| Tasmania | Auctioning vehicles for their owners isn't "dealing", so no trader licence is needed for it. | Motor Vehicle Traders Act 2011 (Tas) s 4(3)(d) |
| ACT | Dealer licence; written authority to sell for a non-trade owner, lapsing after 90 days; proceeds held in trust. | Sale of Motor Vehicles Act 1977 (ACT) ss 31, 33 |
| Northern Territory | Licensed auctioneer. | Consumer Affairs NT; Grays motor vehicle warranty guidance |

Built in: seller agreement s 1 (written consignment authority, 90 days, the required contents with the sell form) and
s 10 (trust account); Terms s 1 (licences, `{{LICENCES}}` from settings) and s 8 (trust account); the footer and live
room show the licence line (`licenceLine()`).

## 6. Statutory warranties

| Position | Built in | Source |
| --- | --- | --- |
| Each listing and the live room state, before bidding opens, whether a statutory warranty applies; listings and advertisements of vehicles without one say "No statutory warranty", beside the price. | `lots.statutory_warranty` (publish check), `warrantySign()`, LotCard, listing notice, live room | MDCA Act 2014 (Qld); MDCA Regulation 2014 (Qld) s 11 |
| A private owner's vehicle sold at auction has none in QLD (consignment for a private seller excluded), NSW (auction with the dealer's notice), VIC, WA, SA, TAS, NT (auction sales excluded). The ACT duty to repair isn't lifted for auctions (only motorcycles). A dealer's own vehicle can carry one. | `warrantyGuide()` for staff; Terms s 4 | Qld "Warranty for used cars"; NSW "Dealer guarantees and warranties"; MVDA 1973 (WA) s 32(1)(b); SHVDA 1995 (SA) s 23(3); ACT SMVA 1977 ss 23, 25A(5)(b) |

## 7. Safety and roadworthy certificates

| State | Position | Source |
| --- | --- | --- |
| Queensland | Safety certificate needed to transfer a registered light vehicle (no auction exemption); private seller's certificate valid 2 months or 2,000 km. | qld.gov.au "Safety certificates" |
| Victoria | RWC needed to transfer a registered vehicle (light trailers exempt), issued less than 30 days before the sale; a car at auction may be sold without one, but the buyer then needs it within 14 days, so here the seller supplies it. | VicRoads "Buy a registered vehicle", "Buying at auction"; CAV auction page |
| ACT | Roadworthy inspection before transfer for vehicles up to 4.5 t more than 6 years old. | Access Canberra "Buying an ACT registered vehicle" |
| NT, SA | NT light vehicles 7+ years; SA heavy vehicles and trailers 3+ years. | `src/lib/transfer.ts` (state pages, checked October 2026) |
| NSW, WA, TAS | None needed to transfer a current registration. | Service NSW; WA DoT; Service Tasmania |

Built in: `roadworthy_needed()` / `certNeeded()`; publish check (date on file, Victorian 30-day and Queensland 2-month
rules, or a written exemption); `certLine()` on the listing; seller agreement s 6 (seller supplies and keeps it current);
Terms s 10 (buyer may cancel if a lapsed certificate can't be renewed).

## 8. Selling for an unnamed owner; GST

| Position | Built in | Source |
| --- | --- | --- |
| An agent may contract for a principal it doesn't name. Because the buyer can't deal with the owner, Tyrebiter takes on payment, title, transport, the vehicle from pickup, and every promised refund. | Terms s 1; sale certificate "as agent for the owner" | General law of agency (unnamed principal) |
| GST-registered sellers: Subdivision 153-B arrangement, so Tyrebiter issues the buyer's tax invoice in its own name and the seller stays private. | Seller agreement s 14; invoice PDF footer | A New Tax System (Goods and Services Tax) Act 1999 Subdiv 153-B; GSTR 2000/37 |

## 9. Privacy, transport, depot, uncollected goods

| Position | Built in | Source |
| --- | --- | --- |
| Seller never identified to buyers; the pickup address goes only to staff, the transport partner and the partner mechanic. Transfer forms: each party gets only what their part of the state's form needs (e.g. the buyer's licence or customer number in NSW and Queensland, name and address in Victoria). | Migration 21; Terms ss 2, 14; Privacy | Privacy Act 1988 (APP small business exemption at $3m turnover, with exceptions); statutory privacy tort (from 10 June 2025); Service NSW notice of disposal; VicRoads selling a vehicle |
| Transport in the buyer's premium, locked when bidding opens; our responsibility from pickup to handover, with due care and skill. | `lot_fees_snapshot`, `lot_transport_lock`; Terms ss 7, 9 | ACL ss 48, 60 |
| Uncollected vehicles are dealt with under the depot state's uncollected goods law, after its notices. | Terms s 9 | Disposal of Uncollected Goods Act 1967 (Qld); Uncollected Goods Act 1995 (NSW); Australian Consumer Law and Fair Trading Act 2012 (Vic) Part 4.2; Disposal of Uncollected Goods Act 1970 (WA); Unclaimed Goods Act 1987 (SA); Disposal of Uncollected Goods Act 1968 (Tas); Uncollected Goods Act 1996 (ACT); Uncollected Goods Act 2004 (NT) |

## 10. Contract terms (unfair contract terms)

Standard-form terms are tested for significant imbalance, legitimate interest and detriment, and unfair terms carry
penalties from 9 November 2023 (small businesses: under 100 employees or $10 million turnover are protected too). The
terms keep: an ACL carve-out; liability for our own negligence; no termination for any reason; notice before changes,
never applied to a sale already made; reasons for suspension; a capped, proportionate deposit forfeit ("the deposit or
nothing, never both", a genuine pre-estimate, never more than actual loss); and indemnities reduced where we caused the
loss. Sources: ACL Part 2-3 (ss 23-28); ACCC "Unfair contract terms"; Paciocco v ANZ Banking Group [2016] HCA 28
(penalties: a sum is a penalty only if out of all proportion to the legitimate interest protected). `tests/unit/legal.test.mjs`
checks these protections stay in.

## Governing law

Queensland (where the business and the auctions are run from; business days and times are Brisbane's). Each document
says nothing takes away the protections of the buyer's or seller's own state.

## What only Tyrebiter can supply before launch

- The licences actually held, by state (settings `business.licences`; shown in the footer, the Terms and the live room).
  Launch only in the states where the licence is held, or keep listings to those states.
- The licensed chattel auctioneer (an employee in Queensland), whose name goes on each live sale.
- The trust account (bank, account name) for buyer and seller money, and the audit arrangements each state requires.
- The ABN, GST registration and the business address in the environment settings.
- Insurance for vehicles in transit and at the depot (Terms s 9 promises our responsibility either way).
- The transport partner and depot agreements (confidentiality of sellers' addresses, care of vehicles).
- Watch item: Victoria announced tighter auction-house rules on 11 July 2026 (odometer checks before sale, more powers
  for Consumer Affairs Victoria); check the commencement and the regulations before launch.

## Sources

- Australian Consumer Law, Schedule 2 to the Competition and Consumer Act 2010 (Cth): https://classic.austlii.edu.au/au/legis/cth/consol_act/caca2010265/sch2.html
- ACCC, consumer guarantees and auctions: https://www.accc.gov.au/node/231
- ACCC, unfair contract terms: https://www.accc.gov.au/business/selling-products-and-services/contracts
- Butcher v Lachlan Elder Realty [2004] HCA 60: https://www.hcourt.gov.au/sites/default/files/eresources/2004/HCA/60.pdf
- Sale of Goods Act 1923 (NSW) s 60: https://classic.austlii.edu.au/au/legis/nsw/consol_act/soga1923128/s60.html
- Motor Dealers and Chattel Auctioneers Act 2014 (Qld): https://www.legislation.qld.gov.au/view/whole/html/inforce/2024-11-04/act-2014-020
- Motor Dealers and Chattel Auctioneers Regulation 2014 (Qld): https://www.legislation.qld.gov.au/view/whole/html/inforce/current/sl-2014-0249
- Agents Financial Administration Act 2014 (Qld): https://www.legislation.qld.gov.au/view/whole/html/inforce/2014-12-01/act-2014-018
- Queensland Government, buying at auction: https://www.qld.gov.au/law/your-rights/consumer-rights-complaints-and-scams/buying-products-and-services/buying-products/buying-a-car/buying-a-used-car/buying-at-auction
- Queensland Government, warranty for used cars: https://qld.gov.au/law/your-rights/consumer-rights-complaints-and-scams/buying-products-and-services/buying-products/buying-a-used-car/warranty-for-used-cars
- Queensland Government, safety certificates: https://www.qld.gov.au/transport/registration/safety-certificate
- NSW Government, working as a motor dealer: https://www.nsw.gov.au/business-and-economy/running-a-business/industry-specific-business-requirements/working-as-a-motor-dealer
- NSW Government, dealer guarantees and warranties: https://www.nsw.gov.au/driving-boating-and-transport/buying-and-selling-vehicles/dealer-guarantees-and-warranties
- Consumer Affairs Victoria, motor car auction house guidelines: https://www.consumer.vic.gov.au/licensing-and-registration/motor-car-traders/running-your-business/auction-house-guidelines
- Consumer Affairs Victoria, buying a used car at auction: https://www.consumer.vic.gov.au/consumers-and-businesses/cars/buying-a-used-car/ways-to-buy-a-used-car/auction
- VicRoads, buying a registered vehicle: https://www.vicroads.vic.gov.au/registration/buy-sell-or-transfer-a-vehicle/buy-a-registered-vehicle
- VicRoads, buying at auction: https://www.vicroads.vic.gov.au/registration/buy-sell-or-transfer-a-vehicle/other-types-of-transfers/buying-a-car-at-auction
- Motor Vehicle Dealers Act 1973 (WA): https://www.legislation.wa.gov.au/legislation/prod/filestore.nsf/FileURL/mrdoc_44697.htm/$FILE/Motor%20Vehicle%20Dealers%20Act%201973%20-%20%5B06-j0-01%5D.html
- Consumer Protection WA, consignment selling: https://consumerprotection.wa.gov.au/consignment-selling-vehicles
- South Australia, buying a second-hand vehicle (Law Handbook): https://lawhandbook.sa.gov.au/ch10s04s07s03.php
- Motor Vehicle Traders Act 2011 (Tas): https://www.legislation.tas.gov.au/view/whole/html/inforce/current/act-2011-023
- Sale of Motor Vehicles Act 1977 (ACT): https://www.legislation.act.gov.au/DownloadFile/a/1977-29/current/PDF/1977-29.PDF
- Access Canberra, buying an ACT registered vehicle: https://www.accesscanberra.act.gov.au/driving-transport-and-parking/registration/buying-an-act-registered-vehicle
- ATO, GSTR 2000/37 (agency relationships and GST): https://www.ato.gov.au/law/view/document?docid=GST%2FGSTR200037%2FNAT%2FATO%2F00001
- Turners Live autobids (the model): https://turners.co.nz/Turners-Live/autobids-for-turners-live
- Victoria, "Labor cracks down on used car rip-offs" (11 July 2026): https://www.premier.vic.gov.au/labor-cracks-down-used-car-rip-offs
