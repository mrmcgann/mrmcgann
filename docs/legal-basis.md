# Tyrebiter: the legal basis, clause by clause

Settled 23 October 2026 from primary sources (Acts, regulations, regulators' guidance and cases), with selling after
the auction, state by state, added on 26 October 2026 (section 5). Each position below
is built into the engine (the database), the wording (`src/content/legal.ts`, `src/lib/listing.ts` and friends), or
both. If a rule changes in one place, change it in the other, and update this register.

A lawyer gives the finished set a final read before launch (late February or early March 2027). That review is a
check, not a list of open questions: nothing here is waiting on it. The business facts only Tyrebiter can supply are
listed at the end.

## The model in one paragraph

Tyrebiter (a Queensland company) sells vehicles for their owners, as their agent, in live online auctions conducted
by a licensed auctioneer, at the fall of the hammer. Every listing has an auction estimate. A vehicle passed in (or
whose buyer didn't pay) can be sold afterwards by agreement, where the state allows it: the seller agrees the price in
writing, a consultant offers it to a bidder, and the buyer signs the offer, with that state's protections for a
dealer's sale (cooling-off, notices). Tyrebiter never gives a statutory warranty or takes on a dealer's duty to repair:
it sells only where none applies, so a vehicle one would cover isn't sold after the auction, and in the ACT (where the
duty to repair applies even at auction) one it could cover isn't listed at all. Never in Victoria, where a consigned vehicle can only be sold
at auction; in Tasmania and the Northern Territory only once the licence that covers it is held. Otherwise it goes into
the next live auction for its state. Tyrebiter is never at the vehicle: the seller supplies the photos and walkaround
video, and staff check them against the registration record, the PPSR search and the papers. Buyers never see the
vehicle or learn who the seller is. After payment, a transport partner takes the vehicle to a depot, where the buyer
collects it.

## 1. Sale by auction, and the consumer guarantees

| Position | Built in | Source |
| --- | --- | --- |
| Every sale under the hammer is a "sale by auction": conducted by the owner's agent, in person or electronically. A sale after the auction isn't one, and is treated as the dealer's own private-treaty sale it is (section 5, "Selling after the auction"). | Live-only engine (migration 22); after-auction sales (migration 26, `sold_via` 'after_auction'); Terms ss 4, 6 | Australian Consumer Law (Sch 2, Competition and Consumer Act 2010) s 2, definition of "sale by auction" |
| The guarantees of title, undisturbed possession and no undisclosed securities (ss 51 to 53) apply to every sale; acceptable quality, fitness for purpose, description and sample (ss 54 to 59) don't apply to sales by auction. | `consumerRights()`; Terms s 4; Help | ACL ss 51 to 59 (ss 54 to 59 apply only where "the supply does not occur by way of sale by auction"); ACCC, "Auctions" guidance |
| A sale after the auction: ss 51 to 53 apply; ss 54 to 59 apply to a supply "in trade or commerce", so to a business seller's vehicle. A private owner's sale of their own vehicle isn't made in trade or commerce just because an agent makes it for them, so for a private seller we say they may not apply, and that any guarantee that does apply can't be excluded. We never say they're excluded. | `consumerRights('after', …)` on the offer page, the contract and the invoice; Terms s 4 | ACL ss 51 to 59, 29(1)(m), 64; Williams v Pisano [2015] NSWCA 177 (a private owner's sale isn't conduct in trade or commerce, and engaging an agent doesn't make it a business dealing); Concrete Constructions (NSW) Pty Ltd v Nelson (1990) 169 CLR 594 |
| Misleading conduct law always applies; nothing excludes non-excludable rights. | Terms ss 4, 13; Website terms s 1 | ACL ss 18, 29, 64 |
| No Buy Now, tenders, offers instead of the auction, or referrals: the auction comes first, and below the reserve the vehicle is passed in, never referred. After a pass-in (or a buyer's default), a sale by agreement is possible only on the seller's written agreement to the price at the time, by a written offer the buyer signs, in a state that allows it (section 5); otherwise, and in Victoria always, the vehicle goes into the next live auction for its state. The passed-in highest bidder is told one of our consultants will be in touch. | `buy_now`, `make_offer`, `seller_decide`, `admin_accept`, `respond_second_chance` refuse; `close_one_lot` passes in below the reserve; `admin_after_offer`, `respond_after_offer`; `queue_status_notices`, `queue_passed_followup`, `relist_auto` | ACL s 2; Motor Car Traders Act 1986 (Vic), CAV "Motor car auction house guidelines"; MDCA Regulation 2014 (Qld) s 30(2)(a) (after goods are passed in, the auctioneer may disclose a bidder's identity to the seller "to enable negotiation") |
| No cooling-off period for a sale by auction. A sale after the auction gets the state's cooling-off where it has one (section 5). | Terms summary, ss 4, 6 | Qld: "Buying at auction" (no cooling-off at auction); ACT Sale of Motor Vehicles Act 1977 s 25B(7); CAV auction guidance |

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
| Queensland | Motor dealer licence (corporation) plus a chattel auctioneer licence held by the employee who conducts the auctions; a corporation motor dealer may sell used vehicles by auction if the auction is conducted by its employed licensed chattel auctioneer. The motor dealer licence also covers selling a consigned vehicle by private treaty after the auction; the consultant who negotiates it is a registered motor salesperson (or the licensee). Trust account for consignment money (deposit by the end of the next business day). | Motor Dealers and Chattel Auctioneers Act 2014 (Qld) ss 14, 40(2), Part 5 (ss 151, 152: what a motor salesperson's registration authorises); Agents Financial Administration Act 2014 (Qld) ss 16, 22 |
| New South Wales | Motor dealer licence (notify Fair Trading of online-only trading; licence number on the website and ads); written consignment agreement (names, addresses, licence numbers, vehicle, loan details, agreed price, payment directions, consignment period); trust account; Form 11 auction notice that dealer guarantees don't apply; PPSR search number on the sales notice. | Motor Dealers and Repairers Act 2013 (NSW) and Regulation; NSW Government "Working as a motor dealer" and "Required forms for motor dealers" |
| Victoria | LMCT endorsed for auction sales. Retail consignment selling is prohibited, but consigned vehicles may be sold at public auction (fall of the hammer, public able to bid): so nothing is sold after the auction. Dealings book records owner and buyer. | Motor Car Traders Act 1986 (Vic); CAV "Motor car auction house guidelines" |
| Western Australia | Dealer licence covering auction; consignment approval; written, signed consignment agreement containing the prescribed vehicle consignment contract terms (Schedule 4: among them, the dealer pays warranty claims about the vehicle's quality or fitness and can't claim those repairs from the owner); trust account before accepting consignments, proceeds banked by the next day; licence number in every advertisement. Anyone acting as a salesperson holds a salesperson's licence. | Motor Vehicle Dealers Act 1973 (WA) ss 5, 5A, 21, 31B, 32A-32D, 32I; Motor Vehicle Dealers (Sales) Regulations 1974 (WA) r 13A, Sch 4 cl 9; Consumer Protection WA "Consignment selling" |
| South Australia | Second-hand vehicle dealer licence; Form 11 auction notice; Form 13 notice to the purchaser. | Second-hand Vehicle Dealers Act 1995 (SA) ss 7, 20, 23(3); CBS forms |
| Tasmania | Auctioning vehicles for their owners isn't "dealing", so no trader licence is needed for it. Selling one for its owner other than by auction (after the auction) is dealing, which needs a motor vehicle trader licence: so no sales after the auction in Tasmania until one is held. | Motor Vehicle Traders Act 2011 (Tas) ss 4(1), 4(3)(d), 4(4)(e), 6 |
| ACT | Dealer licence; written authority to sell for a non-trade owner, lapsing after 90 days; proceeds held in trust. | Sale of Motor Vehicles Act 1977 (ACT) ss 31, 33 |
| Northern Territory | Licensed auctioneer. Selling to the public otherwise needs a motor vehicle dealer licence: so no sales after the auction in the Territory until one is held. | Consumer Affairs NT; nt.gov.au "Buying a used vehicle" ("All NT motor vehicle dealers selling to the public must have a licence"); Grays motor vehicle warranty guidance |

Built in: seller agreement s 1 (written consignment authority, 90 days, the required contents with the sell form) and
s 10 (trust account); Terms s 1 (licences, `{{LICENCES}}` from settings) and s 8 (trust account); the footer and live
room show the licence line (`licenceLine()`).

### Selling after the auction, state by state

A sale after the auction is a motor dealer's sale of a consigned vehicle by private treaty, not a sale by auction, so
each state's rules for a dealer's sale apply to it. The vehicle's state is where it's consigned and collected (the
listing's state); a vehicle located or registered in Victoria is treated as Victorian.

| State | Can we sell after the auction? | Cooling-off | Statutory warranty (a private owner's vehicle) | Paperwork with the offer | Source |
| --- | --- | --- | --- | --- | --- |
| Queensland | Yes (motor dealer licence) | None for a consignment sale, as long as the vehicle is identified as one: every advertisement says "no cooling-off period applies", and "no cooling-off period—sale on consignment" appears near the price | None: a vehicle sold on consignment for a private seller is exempt (unless the owner is a licensee) | Our written contract | MDCA Act 2014 (Qld) ss 100, 101, 118; MDCA Regulation 2014 (Qld) ss 9, 13(1)(l), 30(2)(a); qld.gov.au "Cooling-off period for buying a used car", "Guarantees and warranties for second-hand vehicles", "Warranty for used cars" |
| New South Wales | Yes (motor dealer licence) | A purchase financed through the dealer or its linked credit provider, where the dealer arranged or facilitated the credit, can be rescinded until 5 pm on the next day the dealer trades; no possession meanwhile; the dealer may keep the lesser of $250 or 2% | Dealer guarantee: a second-hand car up to 10 years old and 160,000 km, 3 months or 5,000 km (motorcycles under 5 years and 30,000 km, 3 months or 3,000 km); not at a bona fide auction with the dealer's notice; not over 4.5 t GVM | Form 5 (dealer's notice), Form 12 (cooling-off notice) | Motor Dealers and Repairers Act 2013 (NSW) ss 67-75 (guarantee), 78-87 (cooling-off), 88-96 (consignment); NSW "Dealer guarantees and warranties", "Required forms for motor dealers" |
| Victoria | No: retail consignment selling is against the law; consigned vehicles may be sold only at public auction | — | — | — | Motor Car Traders Act 1986 (Vic); CAV "Motor car auction house guidelines" |
| Western Australia | Yes (dealer licence; the consultant holds a salesperson's licence) | None (only a court-ordered rescission on the Commissioner's application) | Duty to repair: cash price $4,000 or more ($3,500 for a motorcycle), up to 12 years old and 180,000 km (motorcycles 8 years and 80,000 km): 3 months or 5,000 km up to 10 years and 150,000 km, otherwise 1 month or 1,500 km; auction sales of a non-trade owner's vehicle excluded, consignment not; the dealer can't claim the repairs from the owner | Form 4 (vehicle particulars, signed by us and the buyer); the vehicle sale contract with the Schedule 5 terms | Motor Vehicle Dealers Act 1973 (WA) ss 5, 31B, 32(1), 33, 34-34E, 41A, 42A; Motor Vehicle Dealers (Sales) Regulations 1974 (WA) rr 5, 13A, 13B, Sch 4 cl 9, Sch 5 |
| South Australia | Yes (dealer licence) | 2 clear business days (Saturdays count); before it ends the dealer may take no more than a 10% deposit; the dealer may keep the lesser of 2% or $100 and refunds the rest by the end of the next clear business day. A sale negotiated by the auctioneer immediately after the auction is excluded; we don't rely on that | Duty to repair: a car over $3,000, first registered no more than 15 years before and driven no more than 200,000 km: 2 months or 3,000 km ($3,001 to $6,000), 3 months or 5,000 km (over $6,000); not motorcycles; excluded for a non-dealer's vehicle sold by auction or negotiated by the auctioneer immediately after; can't be waived | Our written contract (signed, with the cooling-off expiry, the price and charges described, where it goes for repairs, and that a waiver of rights under the Act is void); the s 16 notice, the s 18 notice and the cooling-off agreement (s 18C) | Second-hand Vehicle Dealers Act 1995 (SA) ss 3, 15(2), 16-18E, 23, 33; sa.gov.au "Cooling-off rights when buying second-hand vehicles"; CBS "Selling cars in South Australia" |
| Tasmania | Not until we hold a motor vehicle trader licence (auctioning for owners is exempt; selling after the auction isn't) | None | Statutory warranty: not a commercial vehicle, under 120,000 km, compliance plate under 7 years old: 3 months or 3,000 km | The pre-sale disclosure statement (s 37); the contract of sale with the warranty (s 34) | Motor Vehicle Traders Act 2011 (Tas) ss 4, 6, 33-37, 42-45 |
| ACT | Yes (dealer licence) | 3 clear business days after signing; ends if the buyer signs Form 3 before delivery; the dealer refunds less the greater of $100 or 1%; not public auctions or commercial vehicles | Duty to repair for the vehicles in Schedule 1 (generally under 10 years and 160,000 km: 3 months or 5,000 km); not commercial vehicles; consignment not excluded | The notice for the vehicle (s 20), endorsed and signed for the sale (s 21) | Sale of Motor Vehicles Act 1977 (ACT) ss 20, 21, 23-25B, 31; Explanatory Memorandum, Sale of Motor Vehicles (Amendment) Bill 1995 |
| Northern Territory | Not until we hold a motor vehicle dealer licence | None | Statutory warranty: a car under 10 years and 160,000 km, 3 months or 5,000 km (waived only by a form witnessed by police or a Consumer Affairs officer) | The contract of sale (s 160), in duplicate | nt.gov.au "Buying a used vehicle"; Consumer Affairs and Fair Trading (Motor Vehicle Dealers) Regulations 1992 (NT) r 11 |

| Position | Built in | Source |
| --- | --- | --- |
| Sales after the auction are switched on per state in Admin settings (default Queensland, New South Wales, Western Australia, South Australia and the ACT). Victoria can't be switched on; Tasmania and the Northern Territory only once their licence is held. | `after_auction_states()` (setting `selling.after_auction_states`, VIC always dropped), `after_auction_rule()` | The table above |
| Only on the seller's written agreement to the price, given after the auction: from their seller dashboard, or in writing to their consultant (recorded by staff, and confirmed to the seller in writing). The offer is never below it, and the seller can change their mind until a buyer accepts. Their written authority must still be running (90 days). | `seller_accept_after`, `admin_seller_agreed`, `seller_withdraw_after` (`seller_decisions` 'accept_after'/'withdraw_after'); `admin_after_offer` refuses below the seller's price; `after_auction_check` (authority) | MDCA Regulation 2014 (Qld) s 24(1) (follow the client's instructions); ACT Sale of Motor Vehicles Act 1977 s 31 (written authority, 90 days); WA Sch 4 (minimum sale price, written variations) |
| The offer goes to someone who bid on or watched the vehicle, in writing, with our written contract and the state's forms attached; it's open for 4 to 72 hours. The buyer signs it by typing their verified name (the contract is made when they do), and gets a copy. | `admin_after_offer` (forms required per state), `respond_after_offer` (signed name, terms version, time), `/api/offers/[id]/contract`, the state's forms in the private bucket `after-sale-docs` | Electronic Transactions Acts (an electronic signature identifies the signer and shows their intention); SA s 17(4)-(6) (copies); WA Sch 5 cl 1 (formation, copy on signing) |
| Where the state has a cooling-off period, every buyer there gets it, free, and a business day longer than the law gives: New South Wales 2 business days, South Australia 3, the ACT 4, counted in the state's own time. Nothing is invoiced or taken, and the vehicle isn't picked up, until it ends; cancelling is a button on the offer page. | `cooling_off_end()`, offer status 'cooling_off', `cancel_after_offer`, `finish_after_offers` (the clock makes the invoice when it ends) | NSW ss 80-85; SA ss 3, 18B(5), 18B(7); ACT s 25B |
| Business days are counted against that state's own public holidays and the national ones, never another state's. Part-day holidays (Christmas Eve, New Year's Eve) count as whole non-business days, since ending a cooling-off period early is the only direction that carries risk. The extra business day above covers regional variation inside a state, which a state code can't express (the Royal Queensland Show is Brisbane only, Western Australia's King's Birthday moves in some regions, New South Wales has local event days). Top the table up each year; Site health fails when it empties. | `public_holidays.state`, `cooling_off_end(from, days, tz, state)`, `holidays_ahead()` → the `setup.holidays` check (migration 28) | Fair Work Ombudsman, "2027 public holidays" (compiled from each state's own declaration): https://www.fairwork.gov.au/employment-conditions/public-holidays/2027-public-holidays |
| We never sell a vehicle after the auction where a statutory warranty or dealer's duty to repair would apply (it goes into the next auction instead), so the offer and the contract say none applies. | `after_auction_check` ('warranty'), `admin_after_offer` (warranty must be false), the contract; seller agreement s 12 | Section 6 below; NSW s 68; WA s 34 and Sch 4 cl 9.2; SA s 23; ACT s 23; Tas ss 42-44 |
| Queensland listings say "No cooling-off period—sale on consignment" near the price, and "No cooling-off period applies" in search results and other advertisements, so a sale after the auction keeps the consignment exemption. | `coolingOffSign()`, `coolingOffAd()` on the listing, cards, live room and app | MDCA Act s 101; MDCA Regulation s 9 |
| The sale cancels the relist made at the pass-in, and the relist can't go live while an offer or a cooling-off period is open. | `after_sale_complete`, `lot_publish_check` | Avoids two sales of one vehicle |

### Relisting a vehicle that didn't sell, state by state

| Position | Built in | Source |
| --- | --- | --- |
| A vehicle passed in (below the reserve, with no bids, or not offered before the sale finished) goes into the next live auction for its state, as a draft, straight away. Until that listing goes live, it can be sold by agreement where the state allows it (above). In Victoria auction is the only way a consigned vehicle can be sold at all. | `relist_auto` (from `queue_status_notices` and `live_pass_unoffered`): the next published live auction for the vehicle's state, at least 2 days away | CAV "Motor car auction house guidelines" (retail consignment selling is against the law; an auction sale is one at the fall of the hammer with the public able to bid); ACL s 2 |
| The relisted vehicle needs a fresh PPSR search, listing checks and estimate (with its grounds) before it goes live; the reserve is agreed again (it can only go down from the seller's side). | `relist_core` resets them; `lot_publish_check`; `relistSteps()` for staff | ACL s 4 (reasonable grounds for an estimate); NSW: PPSR search number on the sales notice |
| Each auction must fall within the seller's written authority: 90 days from signing. Past that, the seller signs again. | `lot_publish_check` (every state, with `selling.require_checks`); `relist_auto` only picks auctions inside it | ACT: Sale of Motor Vehicles Act 1977 s 31 (a non-trade owner's authority lapses after 90 days); NSW: the consignment agreement states the consignment period; WA: written consignment agreement |
| The state's certificate rules are checked against the new auction's date: a Victorian roadworthy certificate issued less than 30 days before the sale; a Queensland safety certificate no more than 2 months old. | `lot_publish_check` (date of the auction the vehicle is in) | VicRoads "Buy a registered vehicle"; qld.gov.au "Safety certificates" (section 7) |
| The seller can say no to relisting, free, until it's listed; after that, taking it out is a withdrawal (seller agreement s 8). | `seller_decline_relist` / `admin_decline_relist` → `relist_decline_core` (`seller_decisions` 'decline_relist'); seller agreement ss 4, 12 | Seller agreement (contract) |
| Everyone who bid on or watched it last time hears when it's back, and its watchers keep watching the new listing. | `notify_relisted_live` | Privacy Act 1988, APP 6 (a use for the purpose it was collected: bidding on and following that vehicle) |

## 6. Statutory warranties

| Position | Built in | Source |
| --- | --- | --- |
| Each listing and the live room state, before bidding opens, that no statutory warranty applies; listings and advertisements say "No statutory warranty", beside the price. | `lots.statutory_warranty` (publish check: stated, and never true), `warrantySign()`, LotCard, listing notice, live room | MDCA Act 2014 (Qld); MDCA Regulation 2014 (Qld) s 11 |
| We never give a statutory warranty or take on a dealer's duty to repair (the owner's decision: Tyrebiter sells only as the owner's agent). A private owner's vehicle sold at auction has none in QLD (consignment for a private seller excluded), NSW (auction with the dealer's notice), VIC, WA, SA, TAS, NT (auction sales excluded). The ACT duty to repair isn't lifted for auctions (only motorcycles) and has no consignment exclusion, so we don't list an ACT vehicle it could cover. A motor dealer's own vehicle can carry one, so we don't list one that would. | `lot_publish_check` (never `statutory_warranty`; in the ACT `warranty_free_for()`), `warrantyGuide()` for staff; Terms s 4 | Qld "Warranty for used cars"; NSW "Dealer guarantees and warranties"; MVDA 1973 (WA) s 32(1)(b); SHVDA 1995 (SA) s 23(3); ACT SMVA 1977 ss 23(1), 23(9), 25(4), 25A(5)(b) |
| Sold after the auction, the auction exclusions fall away: the NSW dealer guarantee (a vehicle "sold by the motor dealer"; the Act has no consignment exclusion, so we treat it as applying), the WA, SA and ACT duty to repair and the Tasmanian and NT warranties apply to an eligible vehicle, and no contract can exclude them (Queensland still excludes a consignment for an owner who isn't a licensee). So we only sell after the auction where none applies: a vehicle is clear only well past the limits (two years past the age, because the law counts from build, compliance or first registration, which can come after the model year; over the distance; or a kind not covered), unknown counts as covered, and staff confirm from the papers that none applies (the owner isn't a motor dealer; the dates). Every offer and contract say no statutory warranty applies. | `warranty_free_for()` (migration 27) = `warrantyFree()`; `after_auction_check` ('warranty', 'warranty_unknown'); `admin_after_offer` (never with one); the staff confirmation on the lot page | Section 5, "Selling after the auction"; MDRA 2013 (NSW) ss 67-74; MVDA 1973 (WA) s 34, Sch 4 cl 9; SHVDA 1995 (SA) s 23; SMVA 1977 (ACT) ss 23-25; MVTA 2011 (Tas) ss 42-44 |

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

## 11. Credit and insurance referrals (advertising a rate)

Tyrebiter holds no credit licence and no AFSL. It refers to licensed partners, discloses that it is paid a fee, and
never recommends one or advises on credit or insurance, which is what keeps it inside the referrer exemption.

| Position | Where it lives | Basis |
|---|---|---|
| Wherever a rate is advertised, a comparison rate sits beside it with the prescribed warning, word for word. | `COMPARISON_WARNING`, `listingEstimate()` (`src/lib/finance.ts`); `/finance` | National Consumer Credit Protection Regulations 2010 (Cth) reg 99 ("Warnings about comparison rate"), carried over from reg 33C of the Consumer Credit Regulations; National Credit Code s 160 |
| Listing repayment figures are lender-neutral estimates on the all-in price, labelled an estimate and not an offer of credit. | `listingEstimate()`; the listing's finance box | ASIC RG 234 (advertising financial products and credit); NCCP Act s 29 (engaging in credit activity) |
| The referrer note names the arrangement: no credit licence, the partner decides, commissions disclosed. | `REFERRER_NOTE` (`src/lib/partners.ts`) | NCCP Regulations reg 25 (referrer exemption); ASIC INFO 149 |
| Insurance pages carry the general advice warning and never a rating, "best", or a recommendation. | `src/lib/partners.ts`; `/insurance` | Corporations Act 2001 (Cth) s 949A (general advice warning); ASIC RG 234 |
| `/api/leads` sends exactly the fields the consent text lists, and stores the consent text shown. | `consentText`/`FIELDS`, `/api/leads` | Privacy Act 1988 APP 6 (use and disclosure); Spam Act 2003 s 16 (consent) |

For the lawyer's final read: check reg 99's current compilation on the Federal Register of Legislation for any change
to the prescribed wording (we use the short form; reg 99 also allows a longer one), and check each partner's referral
agreement against the exemption relied on.

## Governing law

Queensland (where the business and the auctions are run from; business days and times are Brisbane's). Each document
says nothing takes away the protections of the buyer's or seller's own state.

## What only Tyrebiter can supply before launch

- The licences actually held, by state (settings `business.licences`; shown in the footer, the Terms and the live room).
  Launch only in the states where the licence is held, or keep listings to those states.
- The licensed chattel auctioneer (an employee in Queensland), whose name goes on each live sale.
- The consultants who negotiate sales after the auction: a motor salesperson registration in Queensland and a
  salesperson's licence in Western Australia (or the licensee does it). Tasmania and the Northern Territory stay off
  until Tyrebiter holds a trader (Tas) or dealer (NT) licence; then add them in Admin settings.
- Western Australian sellers also sign the prescribed vehicle consignment contract (the Schedule 4 terms, which
  prevail where they differ from our agreement), and the state's forms for each offer after the auction (NSW Forms 5
  and 12, the SA notices and cooling-off agreement, WA Form 4 and the Schedule 5 sale contract, the ACT s 20 notice)
  come from the regulators' own templates, filled in for the vehicle and attached to the offer.
- Staff confirm, from each vehicle's papers, that no statutory warranty applies before an offer after the auction (the
  owner isn't a motor dealer; its build, compliance and first registration dates and odometer), and don't list a motor
  dealer's own vehicle that would carry one. We never give one, so there are no warranty repairs to budget for.
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
- Queensland Government, cooling-off period for buying a used car: https://qld.gov.au/law/your-rights/consumer-rights-complaints-and-scams/buying-products-and-services/buying-products/buying-a-used-car/cooling-off-period-for-buying-a-used-car
- Queensland Government, guarantees and warranties for second-hand vehicles (dealers): https://www.qld.gov.au/community/fair-trading/regulated-industries-licensing-and-legislation/motor-industry-regulation/legal-requirements-motor-transaction/guarantees-and-warranties-for-second-hand-vehicles
- Queensland Government, warranty for used cars: https://www.qld.gov.au/community/fair-trading/consumer-rights-complaints-and-scams/buying-products-and-services/buying-products/buying-a-car/buying-a-used-car/warranty-for-used-cars
- Motor Dealers and Repairers Act 2013 (NSW), s 78 (cooling-off for dealer-financed purchases): https://classic.austlii.edu.au/au/legis/nsw/consol_act/mdara2013270/s78.html
- Motor Dealers and Repairers Act 2013 (NSW), as made (Parts 4 Divisions 4 to 6): https://legislation.nsw.gov.au/view/pdf/asmade/act-2013-107
- Motor Vehicle Dealers Act 1973 (WA): https://www.legislation.wa.gov.au/legislation/prod/filestore.nsf/FileURL/mrdoc_22622.htm/$FILE/Motor%20Vehicle%20Dealers%20Act%201973%20-%20%5B05-i0-01%5D.html
- Motor Vehicle Dealers (Sales) Regulations 1974 (WA), Schedules 4 and 5: https://www.legislation.wa.gov.au/legislation/prod/filestore.nsf/FileURL/mrdoc_47198.htm/$FILE/Motor%20Vehicle%20Dealers%20(Sales)%20Regulations%201974%20-%20%5B03-j0-00%5D.html
- Second-hand Vehicle Dealers Act 1995 (SA): https://www.legislation.sa.gov.au/_legislation-documents/lz/c/a/second-hand-vehicle-dealers-act-1995/current/1995.9.auth.pdf
- South Australia, cooling-off rights when buying second-hand vehicles: https://sa.gov.au/topics/driving-and-transport/vehicles/buying-and-selling/cooling-off-rights
- Consumer and Business Services SA, selling cars in South Australia: https://cbs.sa.gov.au/__data/assets/pdf_file/0017/1057103/Selling-cars-in-South-Australia.pdf
- Motor Vehicle Traders Act 2011 (Tas), authorised PDF: https://www.legislation.tas.gov.au/view/pdf/authorised/2025-07-01%202025-07-02/act-2011-023
- Sale of Motor Vehicles Act 1977 (ACT), Form 3 (loss of right to terminate): https://www.legislation.act.gov.au/af/2002-27/
- Northern Territory Government, buying a used vehicle: https://nt.gov.au/law/rights/buying-a-new-or-used-vehicle/buying-a-used-vehicle
- Consumer Affairs and Fair Trading (Motor Vehicle Dealers) Regulations 1992 (NT): https://legislation.nt.gov.au/api/sitecore/Act/PDF_History?id=22172
- Motor Dealers and Repairers Act 2013 (NSW), in force (Part 4 Division 4, dealer guarantees): https://legislation.nsw.gov.au/view/whole/html/inforce/2024-05-31/act-2013-107
- The ACT's statutory warranty for second-hand vehicles (under 10 years and 160,000 km; none for second-hand motorcycles), Region Canberra, 28 October 2019: https://region.com.au/stronger-warranties-to-protect-canberrans-who-buy-second-hand-vehicles/332847/
- Williams v Pisano [2015] NSWCA 177 (summary): https://www.cbp.com.au/insights/insights/2015/july/selling-a-house-does-not-amount-to-engaging-in-tra
- Victoria, "Labor cracks down on used car rip-offs" (11 July 2026): https://www.premier.vic.gov.au/labor-cracks-down-used-car-rip-offs
