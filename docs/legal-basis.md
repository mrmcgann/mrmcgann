# Super Trucker: the legal basis, clause by clause

Settled 23 October 2026 from primary sources (Acts, regulations, regulators' guidance and cases), with selling after
the auction, state by state, added on 26 October 2026 (section 5), and re-settled for Super Trucker on 15 to 17 November
2026: trucks only, launching in Queensland, New South Wales and Western Australia, viewed by appointment and collected
where they're kept (sections 15 to 18, and the changes marked "Super Trucker" in sections 1 and 5 to 14). On 17 November
2026: Queensland first, then New South Wales and Western Australia (sections 5 and 18); our own mobile mechanic as the
second way to inspect a truck (section 19); and the words when a truck is passed in below the reserve (section 1). Each position below
is built into the engine (the database), the wording (`src/content/legal.ts`, `src/lib/listing.ts` and friends), or
both. If a rule changes in one place, change it in the other, and update this register.

A lawyer gives the finished set a final read before launch (late February or early March 2027). That review is a
check, not a list of open questions: nothing here is waiting on it. The business facts only Super Trucker can supply are
listed at the end.

## The model in one paragraph

Super Trucker (a Queensland company) sells trucks for their owners, as their agent, in live online auctions conducted
by a licensed auctioneer, at the fall of the hammer: to start, trucks only (settings `selling.categories`) kept in
Queensland (`selling.states`), then New South Wales and Western Australia. Every listing has an auction estimate. A truck
passed in (or whose buyer didn't pay) goes into a later auction: trucks are never sold privately after the auction,
because a goods vehicle is covered by the consumer guarantees at any price outside an auction (section 15). Super
Trucker never gives a statutory warranty: none applies to an owner's truck sold at auction in any of the three states,
and a trade owner's vehicle (which could carry one) isn't listed. Super Trucker lists a truck without visiting it: the
owner supplies the photos and walkaround video, and staff check them against the registration record, the PPSR search
and the papers. The truck stays where it's kept. There are two ways to inspect it before the auction. Verified members
can inspect it themselves there by appointment: Super Trucker agrees each visit with the owner, sends the member the
address and the owner the member's name, and keeps a record of the introduction. Or they book Super Trucker's mobile
mechanic, a paid service, and get the report; anything it finds goes on the listing for every bidder (section 19). Under the owner's 90-day exclusive authority, and the member's agreement at booking, a sale around Super
Trucker to someone it introduced owes it the premium it would have earned (section 16). After payment in full, the buyer
collects the truck from the owner with a release code (section 17). Older listings sold on the earlier depot model keep
it (`lots.collect_from` 'depot'), and the sections that describe it stay for them.

## 1. Sale by auction, and the consumer guarantees

| Position | Built in | Source |
| --- | --- | --- |
| Every sale under the hammer is a "sale by auction": conducted by the owner's agent, in person or electronically. A sale after the auction isn't one, and is treated as the dealer's own private-treaty sale it is (section 5, "Selling after the auction"). Super Trucker: trucks, buses, trailers and machinery are never sold after the auction (section 15). | Live-only engine (migration 22); after-auction sales (migration 26, `sold_via` 'after_auction'); Terms ss 4, 6 | Australian Consumer Law (Sch 2, Competition and Consumer Act 2010) s 2, definition of "sale by auction" |
| The guarantees of title, undisturbed possession and no undisclosed securities (ss 51 to 53) apply to every sale; acceptable quality, fitness for purpose, description and sample (ss 54 to 59) don't apply to sales by auction. | `consumerRights()`; Terms s 4; Help | ACL ss 51 to 59 (ss 54 to 59 apply only where "the supply does not occur by way of sale by auction"); ACCC, "Auctions" guidance |
| A sale after the auction: ss 51 to 53 apply; ss 54 to 59 apply to a supply "in trade or commerce", so to a business seller's vehicle. A private owner's sale of their own vehicle isn't made in trade or commerce just because an agent makes it for them, so for a private seller we say they may not apply, and that any guarantee that does apply can't be excluded. We never say they're excluded. | `consumerRights('after', …)` on the offer page, the contract and the invoice; Terms s 4 | ACL ss 51 to 59, 29(1)(m), 64; Williams v Pisano [2015] NSWCA 177 (a private owner's sale isn't conduct in trade or commerce, and engaging an agent doesn't make it a business dealing); Concrete Constructions (NSW) Pty Ltd v Nelson (1990) 169 CLR 594 |
| Misleading conduct law always applies; nothing excludes non-excludable rights. | Terms ss 4, 13; Website terms s 1 | ACL ss 18, 29, 64 |
| No Buy Now, tenders, offers instead of the auction, or referrals: the auction comes first, and below the reserve the vehicle is passed in, never referred. After a pass-in (or a buyer's default), a sale by agreement is possible only on the seller's written agreement to the price at the time, by a written offer the buyer signs, in a state that allows it (section 5); otherwise, and in Victoria always, the vehicle goes into the next live auction for its state. The passed-in highest bidder is told one of our consultants will be in touch. | `buy_now`, `make_offer`, `seller_decide`, `admin_accept`, `respond_second_chance` refuse; `close_one_lot` passes in below the reserve; `admin_after_offer`, `respond_after_offer`; `queue_status_notices`, `queue_passed_followup`, `relist_auto` | ACL s 2; Motor Car Traders Act 1986 (Vic), CAV "Motor car auction house guidelines"; MDCA Regulation 2014 (Qld) s 30(2)(a) (after goods are passed in, the auctioneer may disclose a bidder's identity to the seller "to enable negotiation") |
| Passed in below the reserve: nobody owes anything, and the highest bidder hears from one of our sales consultants "about it, including whether it'll be offered at a later auction". The words promise no private sale (trucks are never sold after the auction, section 15) and no negotiation. A consultant who calls a bidder or a seller about a vehicle is selling it for its owner, so in Queensland they are a registered motor salesperson employed by the dealer, or the licensee: registration lets an employee sell or negotiate the sale of used vehicles for the dealer, including on consignment, and a salesperson can only work as an employee (a contractor needs their own dealer licence). | `passed_in_top_text()` (migration 38) = `PASSED_IN_TOP`/`passedInTop()` and `RESERVE_NOTE` (`src/lib/estimate.ts`), held together by `tests/unit/inspections.test.mjs`; room conditions (`src/lib/conditions.ts`); Terms s 6; Help | MDCA Act 2014 (Qld) (motor salesperson registration certificates); Queensland Government, "Register as a motor salesperson" and "Apply for a motor dealer licence"; ACL s 18 |
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

## 4. Remote checking (we list without visiting the vehicle)

| Position | Built in | Source |
| --- | --- | --- |
| Seller-supplied content (photos, video, declarations, reports) is labelled as the seller's and passed on without being adopted; "checked by Super Trucker" is used only for what staff check (the photos against the records and each other). | `LISTING_CHECKS`, `REMOTE_REPORT`, `PHOTO_CHECK`, listing legend; Terms s 3 | Butcher v Lachlan Elder Realty Pty Ltd [2004] HCA 60 (an agent that merely passes on the principal's information, without adopting it and saying so, isn't misleading) |
| The seller warrants the photos and video are of this vehicle, recent (14 days), unedited, and show known damage. | Seller agreement s 6; `SELLER_ACKS.video`; `PHOTO_RULES` | Contract (indemnity, s 11); supports Super Trucker's reasonable reliance under ACL s 18 |
| Photos copied from the sell form are stripped of EXIF/GPS/XMP/IPTC on the server; videos have their recorded place blanked. | `stripImageMetadata`, `copySellerPhotos`, `blankLocation` | Privacy Act 1988 (APP 11 security, where it applies); Privacy and Other Legislation Amendment Act 2024 (statutory tort for serious invasions of privacy, from 10 June 2025) |
| The Grays case: listed facts (year, transmission, features, damage, warning lights) must be right. | Eleven listing checks, publish gate | ACCC v GraysOnline (Federal Court, 2024, $10 million penalty) |

## 5. Licensing and consignment, state by state

Super Trucker launches in Queensland only (`selling.states` ["QLD"], migration 38; `lot_collect_rules` refuses to
publish anywhere else, and the sell form takes only trucks kept in Queensland), then New South Wales and Western
Australia. The other states' rows stay for when they're added. For trucks in Queensland, New South Wales and Western
Australia, see also section 18.

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

Super Trucker: switched off for trucks, buses, trailers and machinery (`after_auction_check` 'heavy', unless
`selling.after_auction_heavy`), for the reason in section 15. The analysis below stays for lighter vehicles, if they're
ever sold again.

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
| We never give a statutory warranty or take on a dealer's duty to repair (the owner's decision: Super Trucker sells only as the owner's agent). A private owner's vehicle sold at auction has none in QLD (consignment for a private seller excluded), NSW (auction with the dealer's notice), VIC, WA, SA, TAS, NT (auction sales excluded). The ACT duty to repair isn't lifted for auctions (only motorcycles) and has no consignment exclusion, so we don't list an ACT vehicle it could cover. A motor dealer's own vehicle can carry one, so we don't list one that would. | `lot_publish_check` (never `statutory_warranty`; in the ACT `warranty_free_for()`), `warrantyGuide()` for staff; Terms s 4 | Qld "Warranty for used cars"; NSW "Dealer guarantees and warranties"; MVDA 1973 (WA) s 32(1)(b); SHVDA 1995 (SA) s 23(3); ACT SMVA 1977 ss 23(1), 23(9), 25(4), 25A(5)(b) |
| Super Trucker (trucks): none applies to an owner's truck sold at auction in any launch state. Queensland excludes a commercial vehicle from a "warranted vehicle" outright, as well as a consignment for an owner who isn't a licensee, so a truck is doubly outside it; the auctioneer still announces before the auction that no statutory warranty applies. New South Wales: the dealer guarantee doesn't apply to a sale at auction with the dealer's notice. Western Australia: Part III of the Act (with the duty to repair) doesn't apply to a sale by auction unless the vehicle is owned by a trade owner, and the duty to repair separately excludes a goods vehicle with one row of seats (a crew cab isn't excluded by that limb). A trade owner is a person who acquired the vehicle to resell it, so in Western Australia we don't list a trade owner's truck, and everywhere the seller declares whether they're a motor dealer or bought it to resell. | `lot_publish_check` (`statutory_warranty` never true); seller agreement ss 1, 6; Terms s 4; `warrantySign()` | MDCA Act 2014 (Qld) Sch 1 s 3 (definition of "warranted vehicle": excludes a commercial vehicle and a vehicle sold on consignment for a non-licensee), ss 145-146 (the auctioneer's statement); MDRA 2013 (NSW) s 67ff with the Form 11 auction notice; MVDA 1973 (WA) s 32(1) (Part III and sales by auction; "trade owner"), s 34 (duty to repair; goods vehicle with one row of seats) |
| Sold after the auction, the auction exclusions fall away: the NSW dealer guarantee (a vehicle "sold by the motor dealer"; the Act has no consignment exclusion, so we treat it as applying), the WA, SA and ACT duty to repair and the Tasmanian and NT warranties apply to an eligible vehicle, and no contract can exclude them (Queensland still excludes a consignment for an owner who isn't a licensee). So we only sell after the auction where none applies: a vehicle is clear only well past the limits (two years past the age, because the law counts from build, compliance or first registration, which can come after the model year; over the distance; or a kind not covered), unknown counts as covered, and staff confirm from the papers that none applies (the owner isn't a motor dealer; the dates). Every offer and contract say no statutory warranty applies. | `warranty_free_for()` (migration 27) = `warrantyFree()`; `after_auction_check` ('warranty', 'warranty_unknown'); `admin_after_offer` (never with one); the staff confirmation on the lot page | Section 5, "Selling after the auction"; MDRA 2013 (NSW) ss 67-74; MVDA 1973 (WA) s 34, Sch 4 cl 9; SHVDA 1995 (SA) s 23; SMVA 1977 (ACT) ss 23-25; MVTA 2011 (Tas) ss 42-44 |

## 7. Safety and roadworthy certificates

| State | Position | Source |
| --- | --- | --- |
| Queensland | A registered vehicle up to 4.5 t GVM needs a safety certificate to transfer the registration (no auction exemption); a private seller's is current 2 months or 2,000 km. A heavy vehicle over 4.5 t (and a bus) needs a certificate of inspection instead, current for 12 months; a vehicle in the NHVAS maintenance module needs one unless the buyer is in NHVAS too. The seller supplies it; the publish check needs its date (2 months for a safety certificate, 12 months for a certificate of inspection, counted back from the auction) or a written exemption. | qld.gov.au "Safety certificates", "Selling a used vehicle" (heavy vehicles, licensed tow trucks, buses: a certificate of inspection; NHVAS); Transport Operations (Road Use Management—Vehicle Standards and Safety) Regulation 2021 (Qld) Part 6 (inspection certificates; the "COI term"), carrying on s 28 of the 2010 Regulation (a certificate of inspection is current for a year) |
| New South Wales | Nothing more is needed to transfer a current registration. But a dealer must not offer, display or sell by auction a registered vehicle with its number-plates on unless a current inspection report (issued in the 42 days before) is attached, and an online dealer "attaches" it by making it publicly available on the website; the s 57(2) "within 7 days" option was omitted in 2023. The rule doesn't apply where the registration was first issued or renewed within 90 days before the sale, or to a sale to a dealer, recycler or financier. A vehicle offered without plates needs the plates' surrender receipt (or the dealer's declaration of why they're off) shown with it. So: a registered NSW truck has its report photographed on the listing (`roadworthy_issued_on`, 42 days), or an "Exempt" note giving the 90-day renewal; otherwise it's sold unregistered with the reason shown (`plates_note`, 10+ characters). The rule follows where it's auctioned (`certState()`), not where it's registered. | Motor Dealers and Repairers Act 2013 (NSW) ss 55-59 (s 57(1); s 55(2) exemptions; s 59 plates surrendered); Motor Dealers and Repairers Amendment Act 2023 (NSW) (No 28, omitting s 57(2)); Motor Dealers and Repairers Regulation 2025 (NSW) cl 55 ("current" inspection report: 42 days), in force 1 September 2025 |
| Western Australia | Nothing more is needed to transfer a current licence (registration). | WA Department of Transport "Selling a vehicle" |
| Victoria (later) | RWC needed to transfer a registered vehicle (light trailers exempt), issued less than 30 days before the sale; a car at auction may be sold without one, but the buyer then needs it within 14 days, so here the seller supplies it. | VicRoads "Buy a registered vehicle", "Buying at auction"; CAV auction page |
| ACT (later) | Roadworthy inspection before transfer for vehicles up to 4.5 t more than 6 years old. | Access Canberra "Buying an ACT registered vehicle" |
| NT, SA (later) | NT light vehicles 7+ years; SA heavy vehicles and trailers 3+ years. | `src/lib/transfer.ts` (state pages, checked October 2026) |
| TAS (later) | None needed to transfer a current registration. | Service Tasmania |

Built in: `roadworthy_needed()` / `certNeeded()` / `certState()`; publish check (the date on file, with the Victorian
30-day, Queensland 2-month and 12-month and New South Wales 42-day rules, or a written exemption; the New South Wales
plates note); `certLine()` on the listing; `relistSteps()` (the rule for the new auction's date); seller agreement s 6
(the seller supplies it and keeps it current); Terms s 10 (the buyer may cancel if a lapsed certificate can't be renewed).

## 8. Selling for an unnamed owner; GST

| Position | Built in | Source |
| --- | --- | --- |
| An agent may contract for a principal it doesn't name. Because the buyer can't deal with the owner, Super Trucker takes on payment, title, transport, the vehicle from pickup, and every promised refund. | Terms s 1; sale certificate "as agent for the owner" | General law of agency (unnamed principal) |
| GST-registered sellers: Subdivision 153-B arrangement, so Super Trucker issues the buyer's tax invoice in its own name and the seller stays private. | Seller agreement s 14; invoice PDF footer | A New Tax System (Goods and Services Tax) Act 1999 Subdiv 153-B; GSTR 2000/37 |

## 9. Privacy, viewings, collection, uncollected goods

| Position | Built in | Source |
| --- | --- | --- |
| Super Trucker: the listing never names the owner and shows the suburb, never the street. The address (with the owner's directions) goes only to a verified member whose viewing the owner has agreed, the buyer once their collection time is confirmed, and a partner mechanic a bidder sends; the owner agreed to that in the seller agreement (s 15). The owner is told the name of whoever is coming to view or collect, which the member agrees to when they book. Neither side gets the other's phone, email or home address. Transfer forms: each party gets only what their part of the state's form needs. The Queensland sale statement still names the owner after the hammer (section 12). | `invoice_pickup()` (address only once a collection is confirmed, buyer or admin only), `admin_viewing` (the address in the confirmation only), `seller_lot_collection()` (the collector's name, never their contact details), `lot_introductions()` (admins only); Privacy policy; Terms ss 2, 5, 14; seller agreement s 15 | Privacy Act 1988 (Cth) APPs 5 and 6 (notice at collection; use and disclosure for the primary purpose the person was told of; the small business exemption at $3m turnover, with exceptions); statutory tort for serious invasions of privacy (Privacy and Other Legislation Amendment Act 2024, from 10 June 2025) |
| Viewings are for verified members only (mobile and ID verified, as for bidding), so an owner is never sent an anonymous stranger, and a stolen-truck scout can't book one without being identified. | `request_viewing` (`can_bid`) | Risk control; supports the reasonable care owed to the owner as our principal |
| Older depot listings: the seller is never identified to buyers; the pickup address goes only to staff, the transport partner and the partner mechanic; transport is in the buyer's premium, locked when bidding opens, and our responsibility from pickup to handover. | Migration 21; `lot_fees_snapshot`, `lot_transport_lock` | ACL ss 48, 60 |
| Uncollected trucks are dealt with under the law of the state they're in, after its notices: in the launch states, the Disposal of Uncollected Goods Act 1967 (Qld), the Uncollected Goods Act 1995 (NSW) and the Disposal of Uncollected Goods Act 1970 (WA). The truck is the owner's to keep until then, and storage is the owner's charge to the defaulting buyer. | Terms s 9 | Those Acts; the other states' Acts stay listed for later: Australian Consumer Law and Fair Trading Act 2012 (Vic) Part 4.2; Unclaimed Goods Act 1987 (SA); Disposal of Uncollected Goods Act 1968 (Tas); Uncollected Goods Act 1996 (ACT); Uncollected Goods Act 2004 (NT) |

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

Super Trucker holds no credit licence and no AFSL. It refers to licensed partners, discloses that it is paid a fee, and
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

## 12. The buyer's sale contract

The contract is made at the fall of the hammer (section 2), on the Terms the bidder accepted before bidding and the
auction conditions they ticked before entering the room. The document the winner is given **records** that contract.
Nothing in it is a condition of the sale, and no wording anywhere may suggest the sale needs a signature to complete:
that would hand a defaulting buyer the argument that there was no sale, and would cut against the deposit forfeit and
the ban. Where a state's own form is signed by the buyer, the acknowledgement is how we discharge that form.

| Position | Where it lives | Basis |
|---|---|---|
| Queensland: immediately after the sale we give the buyer a statement, signed by us, with the prescribed particulars about the vehicle **and about the person who owned it immediately before the sale** — including that person's name. It applies to a chattel auctioneer as much as a motor dealer, and there is no auction or consignment exemption: the Act exempts auction and consignment sales elsewhere when it means to (ss 6, 100(2)) and does not here. So the owner's **name** reaches the buyer, after the hammer, on this statement only — never their address or phone, and never before or during bidding. | `buyerContract.ts` (`namesOwner`), the statement PDF; the seller agreement and the privacy policy tell sellers so before they consign | Motor Dealers and Chattel Auctioneers Act 2014 (Qld) s 74, especially s 74(1)(b) (particulars about "the vehicle's owner immediately before the sale") with s 74(2)-(3) (keep a copy; the statement may sit in the contract of sale); "licensee" is s 14; Motor Dealers and Chattel Auctioneers Regulation 2014 (Qld) s 8, in particular s 8(a) (the owner's name) |
| Queensland: the odometer goes on the statement in **words and figures**, with whether it or the engine has been replaced so far as we are told. Where the owner did not say, the statement says we were not told, never that we checked. | `odometerWords`, `odometerLine`, `engineLine`; the sell form's `odometer_concerns` and `engine_replaced` questions | MDCA Regulation 2014 (Qld) s 8 |
| New South Wales: Form 11 is the auction notice. The dealer and the buyer sign it at the time of sale and the buyer is given a copy, so the buyer's acknowledgement is what discharges it. | `needsSignature('NSW')`; the acknowledgement on the invoice | Motor Dealers and Repairers Act 2013 (NSW) and Regulation; NSW Fair Trading, "Required forms for motor dealers" |
| South Australia: Form 11 auction notice and Form 13 notice to the purchaser, likewise signed. | `needsSignature('SA')` | Second-hand Vehicle Dealers Act 1995 (SA) ss 7, 20, 23(3); CBS forms |
| Tasmania: auctioning a vehicle for its owner is not "dealing", so no trader's forms apply to the sale. | `STATE_RULES.TAS` | Motor Vehicle Traders Act 2011 (Tas) ss 4(1), 4(3)(d), 4(4)(e), 6 |
| A state we have not settled still gets the full Queensland-style statement, because it is the strictest: giving it everywhere can only be more than the minimum, never less. | `ruleFor()` falls back to QLD | — |
| The buyer draws a signature, in every state, not only the two whose own form is signed. That is our own practice rather than a statutory requirement outside New South Wales and South Australia, and it does not make the sale conditional: refusing to record an acknowledgement without a drawing is a rule about our paperwork, and the buyer still owns the vehicle and still owes for it from the fall of the hammer. The strokes are stored as numbers and redrawn by us, never as an image the browser sends. | `acknowledge_sale` (`sign_draw`), `SignaturePad`, `cleanSignature`, the `invoices_ack_signature_shape` constraint | Electronic Transactions Act 1999 (Cth) s 10 (a signature by electronic means, with a reliable method of identifying the person: here the drawing plus the name matched against the verified account) |

Western Australia is settled (Super Trucker, November 2026): Part III of the Motor Vehicle Dealers Act 1973 (WA), with its
prescribed notices and the Schedule 5 contract, doesn't apply to a sale by auction unless the vehicle is owned by a trade
owner (s 32(1)), and we don't list a trade owner's vehicle there, so the auction buyer gets our statement with the
state's notice and no prescribed form. For the lawyer's final read: confirm whether Victoria, the ACT and the Northern
Territory require a prescribed notice to an auction buyer (as distinct from the private-treaty forms in section 5), when
those states are added, and confirm the Queensland reading above, which is the one place a seller's name reaches a buyer. `STATE_RULES[...].toConfirm` names
each open point in the code so it cannot be lost.

## 13. Putting it in the buyer's name: registration transfer

Transferring the registration is the buyer's own transaction with their state, not ours, and not part of the sale: we
hand them the certificate of sale, the seller lodges their side, and the state does the rest. Two machines, and the
code keeps them apart (`src/lib/transfer.ts`).

| Position | Where it lives | Basis |
| --- | --- | --- |
| A car, ute, van, motorbike, truck, bus, trailer or caravan is a road vehicle. Its registration is transferred through the state's transport authority: the seller lodges a notice of disposal (or starts the transfer), the buyer completes it and pays the transfer fee and duty, and some states need a safety or roadworthy certificate first. | `TRANSFER_RULES`, `rulesFor`, `certNeeded` (mirrored by `roadworthy_needed()`), `certLine` | Each state's transport authority (links in the table; checked October 2026) |
| A boat is not a road vehicle. Its registration belongs to the state's **marine** authority, on a separate form, with its own deadline and its own fee. Sending a boat buyer to the vehicle transfer page would be the wrong form. Queensland is the only state that runs boats through the same online transfer as vehicles, and the copy says so. | `VESSEL_RULES`, `vesselFor`, `isVessel` | Maritime Safety Queensland via TMR; Transport for NSW; VicRoads; WA Department of Transport (marine); Service SA; Marine and Safety Tasmania via Service Tasmania (links in the table; checked November 2026) |
| A boat sold on its trailer carries **two** registrations, and transferring the boat does nothing for the trailer. The trailer is a road vehicle and goes through the transport authority like any other. | `trailerNote` | As above, both columns |
| Machinery is normally registered nowhere, so there is nothing to transfer: the certificate of sale in the buyer's name is the whole record of ownership. This is the path the unregistered branch already takes. | `certNeeded` (null for `machinery`), the unregistered branch of `TransferStep` | Sale of Goods Act 1896 (Qld) s 21 (title passes on the contract, not on registration) |
| No deadline or fee is stated for a vessel. Authority and form are verified; the day count is not, and a wrong figure on a statutory clock is the one thing on that screen that could cost a buyer a late fee, so the buyer is sent to the state's own page for both. | the comment above `VESSEL_RULES`; `tests/unit/transport.test.mjs` asserts no day count or dollar figure appears in the vessel copy | — |
| The Australian Capital Territory and the Northern Territory are unsettled for vessels (the Territory may not register recreational vessels at all). Both are `null`, and the screens then tell the buyer their consultant will do that part, rather than link a page we have not read. An unknown state is `null` too: a road transfer can safely fall back to Queensland because every state runs the same shape, but a marine one cannot. | `VESSEL_RULES.ACT`, `VESSEL_RULES.NT`, `vesselFor` | — |
| Registration is never where the seller's identity leaks. Where a state's form asks the buyer for the seller's details, the buyer is told to call us and we complete that part. | step 3 of `TransferStep` (web and app) | Section 9 below; `MDCA` Reg s 8(a) is the only place a seller's name reaches a buyer, and it is the statement, not the transfer |

Before launch: read each state's vessel page and add the deadline and the fee, then drop the `[CHECK ...]` marker
above `VESSEL_RULES`; settle the ACT and the NT either way. The road table's own marker is the same job on the other
half, and both are due again every few months because these pages move.

## 14. Releasing an unregistered vehicle at the handover

Our exposure is not the buyer's failure to register. It is the moment whoever holds the keys hands them over. Super
Trucker: that's the owner, at their own place, using our handover page, so the same gate protects them (and the seller
agreement s 7 tells them why). The depot wording below describes the earlier model and applies to its listings.

In the launch states: Queensland makes it an offence to use, **or permit to be used**, an unregistered vehicle on a road
(below); Western Australia makes it an offence for a vehicle's **responsible person** (its owner or licence holder), as
well as its user, to use it on a road without a current licence, unless under a permit (Road Traffic (Vehicles) Act 2012
(WA) s 4, with s 4(4) and the permits in s 13(1); a 15-day grace after a licence ends, Road Traffic (Vehicles)
Regulations 2014 (WA) r 16); New South Wales makes it an offence to use an unregistered registrable vehicle on a road
(Road Transport Act 2013 (NSW) s 68(1), 20 penalty units), with uninsured use a separate offence (Motor Accident
Injuries Act 2017 (NSW) s 2.1). The handover page applies the same rule everywhere: no plates means a carrier, a float or
trailer, or a permit number recorded before the keys change hands.

| Position | Where it lives | Basis |
| --- | --- | --- |
| Letting an unregistered vehicle be driven on a road is an offence committed by whoever **permits** it, not only by whoever drives it. We hold the vehicle, hold the keys and decide whether it leaves, so a buyer who drives off our forecourt without a permit puts us inside the offence, not merely near it. | the whole of this section | Transport Operations (Road Use Management—Vehicle Registration) Regulation 2021 (Qld) s 10(1): "A person must not use, or permit to be used, a vehicle on a road that is not a registered vehicle." Maximum 80 penalty units |
| The lawful ways out are exhaustive and we only release into one of them: on a carrier, on a trailer, or driven under a current unregistered vehicle permit. | `complete_handover` (`unreg_how`), the depot's three choices | Same Regulation s 10(2)(f): subsection (1) does not apply to a vehicle "being used under an unregistered vehicle permit" (issued under s 73, up to 7 days) |
| A permit is sighted, not assumed. Where the depot says it was driven, they must enter the permit's number and tick that they saw it, that it is in date and that it covers this vehicle. The handover is refused without it, so the keys cannot be signed over on a shrug. | `complete_handover` (`unreg_permit`), `HandoverForm` | As above: the exemption is only made out by an actual permit, so an unverified claim of one is no defence |
| What was established is recorded against the collection — whether it was unregistered, how it left, and the permit number — so the file shows the check was done rather than asserting it. | the `handover` jsonb on `collections` | Evidentiary; supports the s 10(2)(f) exemption if it is ever questioned |
| The depot is told before anything else on the page, in red, that the vehicle has no plates and must not be driven, and is told to call us and keep the keys if the buyer expects to drive away. | `/handover/[token]` | Operational control; a rule nobody reads protects nobody |
| An unregistered vehicle carries no compulsory third party insurance. Stated to buyers rather than left to be discovered. | Terms s 10 | Queensland's Nominal Defendant answers for injuries caused by an unregistered vehicle and then recovers from those responsible, so this is a live tail risk rather than a theoretical one |

Terms sections 10 and 16 carry this for buyers. Note the limit of contract here: an agreement between us and the
buyer allocates risk **between us**, and cannot stop the regulator treating us as a person who permitted the use.
Only the gate check does that, which is why the control is in `complete_handover` and not only in the wording.

Written-off vehicles are a hard stop, not a permit case: Queensland does not issue an unregistered vehicle
permit for a written-off vehicle at all (they are expressly ineligible, with modified vehicles), so for a
repairable or statutory write-off there is no lawful way to drive it on a road and no permit number against one
can be genuine. `leaves_unregistered()` returns `permit_possible` false for those, the depot is not offered the
permit option, and `complete_handover` refuses it (`unreg_writeoff`). Two practical points follow from the same
page: Queensland's online permit needs a Queensland CRN or licence number, so an interstate buyer cannot simply
buy one at the gate (our own staff can apply on their behalf); and a permit covers one direct journey of one to
seven days with Class 22 CTP, not a window of free use, so telling a buyer to "get a permit" without that invites
a second offence.

How the market handles this, from their own published terms (November 2026): Grays, Slattery Grays and Lloyds all
push it to the buyer by contract, and Slattery states outright that it "is not responsible for verifying the
validity of any permit" (cl 5.3(c)). Manheim instead makes permits obtainable "through any vehicle registration
office and most of our sites". Only the second engages the s 10(2)(f) exemption; the first allocates risk between
the parties and leaves the yard inside the offence. We follow Manheim's approach at the gate and keep the
verification the others disclaim.

Before launch: confirm the equivalent "use or permit to be used" offence and its permit exemption in each other
state we release vehicles in, and record them here. The shape is the same everywhere, but the section numbers,
penalties and permit durations are not, and the depot screen's wording should not imply Queensland's everywhere.

## 15. Trucks are never sold after the auction

| Position | Built in | Source |
| --- | --- | --- |
| A vehicle or trailer acquired for use principally in the transport of goods on public roads is acquired "as a consumer" whatever it costs. So outside a sale by auction, the guarantees of acceptable quality, fitness for purpose and description can apply to a truck, including one a business sells to a business. Under the hammer they don't (they apply only where the supply isn't a sale by auction). | Terms s 4; `consumerRights()` | Australian Consumer Law s 3(1) (the goods-transport limb has no price ceiling), ss 54-59 |
| So trucks, buses, trailers and machinery are never sold by private treaty after an auction: a sale we arranged after the auction would be our own dealer's sale, with guarantees we'd answer for and (in New South Wales, Western Australia and the ACT) dealer duties that can't be excluded. A truck that's passed in goes into a later auction; to sell on the day, the owner lowers the reserve before the hammer (by phone to the auctioneer if need be). | `after_auction_check` ('heavy'; setting `selling.after_auction_heavy`, off); Terms s 6 (`#t-after`, "Nothing is sold after the auction"); seller agreement ss 4, 12; Help | Section 5 ("Selling after the auction"); section 6 |

## 16. Viewings and introductions: the exclusive authority and the introduction fee

Buyers now meet owners, at viewings and at the handover, so the business needs a contract that keeps the sale with us
without being unfair. Both sides agree to the same thing, in plain words, before they meet.

| Position | Built in | Source |
| --- | --- | --- |
| The owner appoints us as exclusive agent for the 90 days of their authority. If the truck is sold any other way in that time, by anyone, to anyone, the owner pays the buyer's premium we would have earned on the price (the rate, plus GST, and our seller fee on it if there is one). For the `auction.exclusivity_days` (90) after the authority ends or a withdrawal, the same is payable on a sale to someone we introduced: anyone we named to them in writing, anyone who bid, anyone who found it through us. A clean withdrawal and a sale to someone we didn't introduce costs only the withdrawal fee. The owner says no to direct approaches and tells us the same day. | Seller agreement ss 1, 2, 8; `SELLER_ACKS.no_contact`; `lot_introductions()` (the record of every introduction); `legalValues` (`EXCLUSIVITY_DAYS`, `SELLER_FEE_ALSO`) | An exclusive sale authority with commission on any sale in its term is the standard consignment and agency form (and the written consignment authority the dealer laws require, section 5). Western Australia's prescribed Schedule 4 consignment terms prevail where they differ (seller agreement s 16) |
| The member agrees, when they ask to view, ticking these exact words (`viewingAck`, stored on the booking with the terms version and time): we're introducing them; if they buy that truck from its owner other than through us, while it's listed or within the same period after, they pay the premium we would have earned on the price they paid; they won't make the owner an offer or ask them to deal direct; the address is for that viewing only; the owner is given their name. Every bidder agrees the same in Terms ss 5 and 18. | `request_viewing` (`viewing_ack`; `viewings.ack_text/ack_version/ack_at`), `viewing_ack_text()` held to the TypeScript wording by the database test; Terms ss 5 (`#t-intro`), 18; Website terms s 3 | Terms brought to a party's notice before the contract is made bind them: Oceanic Sun Line Special Shipping Co Inc v Fay (1988) 165 CLR 197; Electronic Transactions Act 1999 (Cth) s 8 (a transaction isn't invalid because it took place electronically) |
| The amount is the fee we'd have earned and no more, payable once (from the buyer or the owner, never both), on the actual price (the low estimate only if the owner won't say), for a limited time, and only after an introduction we can prove. That keeps it proportionate to the legitimate interest it protects (the fee for the advertising, checks and introduction already given) rather than a penalty, and keeps it transparent and limited enough to survive the unfair-terms test in a consumer or small-business standard form. | Terms s 5; seller agreement s 2 ("what we lose ... and no more"; "We don't also collect it from the buyer") | Paciocco v Australia and New Zealand Banking Group Ltd [2016] HCA 28 (a stipulated sum is a penalty only if out of all proportion to the legitimate interest protected); ACL ss 23-25 (unfair terms: imbalance, legitimate interest, detriment; s 24(3) transparency; s 25(c) one-sided penalties as an example) |
| Viewings: in person only (no video calls with an owner), verified members only, offered times from tomorrow to the day before the auction, one open request per truck, five open in all. Looking and listening only, no road test (an unregistered or uninsured truck, licence classes and the owner's insurance all argue against it). Nobody from Super Trucker attends. The yard is the owner's workplace: visitors follow its rules and answer for damage they cause; the owner keeps the site safe. What an owner says isn't part of the listing until we confirm it in writing and add it for every bidder. | `request_viewing`, `admin_viewing`, `viewing_sweep()`; Terms s 5; seller agreement s 7; Help | Work Health and Safety Act 2011 (Qld) and (NSW), Work Health and Safety Act 2020 (WA) ss 19-20 (a business owner is the person conducting the business at its yard, with duties to visitors); Civil Liability Act 2003 (Qld), 2002 (NSW), 2002 (WA) (a private owner's occupier's duty); ACL s 18 (an unconfirmed statement at a viewing isn't ours) |

## 17. Collecting it from the seller

| Position | Built in | Source |
| --- | --- | --- |
| After payment in full we lodge the owner's notice of disposal (or there's nothing to lodge, when it's sold unregistered). The buyer then books a time; we agree it with the owner; the buyer gets the address and a 6-digit release code, the owner the collector's name and the handover link. The owner checks photo ID against that name and hands over only when the code works; the buyer checks the truck first, and the code is their sign-off, starting the claim window. Never any money between them. | `transfer_clear()`, `collection_needs_transfer`, `collection_ready()` (seller branch), `/api/collections`, admin `confirm-collection` (seller branch), `complete_handover`, `seller_lot_collection()`, `invoice_pickup()`; Terms ss 9, 16; seller agreement s 7 | Contract (the Terms and the seller agreement); Sale of Goods Act 1896 (Qld) s 25, Sale of Goods Act 1923 (NSW) s 23, Sale of Goods Act 1895 (WA) s 20 (risk passes with property unless otherwise agreed: here it's agreed to pass at the handover, or at the end of the collection window) |
| Until the handover the truck is the owner's risk and insured by them; we never hold it. The buyer's protection is the money: it stays in our trust account until the handover is done and the claim window closed, and something materially different at the yard means no code and a full refund. | Terms s 9; seller agreement ss 7, 10; payouts released only after collection and the claim window (`release_payouts()`) | Agents Financial Administration Act 2014 (Qld); Motor Dealers and Repairers Act 2013 (NSW) (consignment money); Motor Vehicle Dealers Act 1973 (WA) (consignment proceeds in trust) |
| No storage until the truck is ready to collect, and none for a delay that's ours or the owner's; after the window, storage, then the uncollected goods law of the truck's state (section 9). | Terms s 9 | Section 9 |

## 18. Trucks in Queensland, New South Wales and Western Australia

Queensland first: the launch sells only trucks kept in Queensland (`selling.states` ["QLD"]). The New South Wales and
Western Australia rows are settled and built in, ready for when those licences are held; the database test checks their
rules with the setting widened, so opening a state is a settings change.

| State | Position | Source |
| --- | --- | --- |
| Queensland | As section 5: the motor dealer licence covers selling trucks for their owners, by auction conducted by its employed licensed chattel auctioneer. A truck over 4.5 t transfers on a certificate of inspection (section 7). Heavy Vehicle National Law applies on the road. | MDCA Act 2014 (Qld) ss 14, 40(2); section 7; Heavy Vehicle National Law (Queensland) |
| New South Wales | As section 5, with the inspection report rule for auctioning a registered vehicle with its plates on (section 7). Heavy Vehicle National Law applies on the road. | MDRA 2013 (NSW) ss 55-59; Heavy Vehicle National Law (NSW) |
| Western Australia | Trucks are "goods vehicles", a class prescribed for the dealer laws, so dealing in them (including selling them for their owners) needs a WA motor vehicle dealer's licence, with consignment approval and a trust account as in section 5. Conducting auctions needs an auctioneer's licence under the Auction Sales Act 1973 (a general licence, granted by a magistrate; $592 for 2026-27), which isn't in the earlier version of this register: we take the cautious reading that it's needed for auctions of trucks kept in Western Australia even when the auctioneer is in Brisbane. Part III doesn't apply to our auctions because we don't list a trade owner's vehicle (sections 6, 12). A temporary movement permit lasts 48 hours, costs $32.40, is arranged by phone (13 11 56) or in person for a heavy vehicle, carries no load, and is only for a trip to a repairer, an inspection or licensing (or to another state to be licensed), never just to drive it home or for parts. The Heavy Vehicle National Law doesn't apply: Western Australia's own road traffic laws do. | Motor Vehicle Dealers Act 1973 (WA) s 5(3); Motor Vehicle Dealers (Prescribed Vehicles) Regulations 1974 (WA) r 3; MVDA s 32(1) ("trade owner"); Auction Sales Act 1973 (WA); WA Department of Transport "Temporary movement permits"; Road Traffic (Vehicles) Act 2012 (WA) s 13 |
| All three | Whoever drives a truck away needs the licence class for its GVM (LR, MR, HR, HC, MC), which every listing shows; that, the mass and dimension rules and any permit are the buyer's. Trailers are a separate category and stay off (`selling.categories`): add them only with their own rules (registration, certificates, the goods-vehicle guarantees). | Terms s 10; `LICENCES`; `lot_publish_check` (GVM required for trucks and buses) |

## 19. Our mobile mechanic

The second way to inspect a truck before the auction (the first is a viewing, section 16). Super Trucker supplies the
inspection to the member who books it, for a fee, while selling the truck for its owner, so the service is built around
that conflict being disclosed and neutralised.

| Position | Built in | Source |
| --- | --- | --- |
| A service Super Trucker supplies: a verified member books it on the listing (up to three mornings or afternoons, to the day before the auction), staff agree a time with the owner and the mechanic, the member pays the fee (setting `selling.mechanic_fee`, $495 including GST by default) by bank transfer by a set time or the booking lapses, the mechanic goes, and the report goes to the member. Nobody is charged before a time is booked. | `mechanic_inspections`, `request_inspection`, `admin_inspection`, `inspection_sweep()` (migration 38); `src/lib/inspections.ts`; Terms s 5 (`#t-mechanic`); Help | Contract; ACL s 18 (what it is and costs, before booking) |
| What it is and isn't: a look over and a run of the engine where the truck is kept, underneath where it's safe, the fitted equipment worked where it can be; no road test, nothing taken apart, and not a safety certificate or certificate of inspection (only an approved inspection station issues those). The report is the mechanic's opinion on the day and says what they could and couldn't check. It doesn't change the as is, where is basis of sale and isn't a promise by us or the owner about the truck. | `inspectionAck` = `inspection_ack_text()` (stored on the booking, held together by the database test); `MECHANIC_CHECKS`, `MECHANIC_LIMITS`; Terms s 5 | ACL ss 18, 29; Transport Operations (Road Use Management) legislation (Qld) (certificates only from approved inspection stations) |
| The conflict: we sell the truck as the owner's agent and engage the mechanic. Disclosed before booking, and neutralised: the owner is told what the mechanic finds (our duty to our principal), and the booking can't be closed until staff confirm the listing's damage and wear shows anything that needs attention, so every bidder has it. A fault our own mechanic found, kept from other bidders while we sell the truck, would be misleading by silence. The full report stays the booker's. | `admin_inspection('done')` refuses without `p_faults` (`inspection_faults_listed`); flaws via `lot_flaws` + `announce_flaw_changes()`; the owner's notice; Terms s 5; seller agreement s 7; `SELLER_ACKS.inspection` | ACL s 18; Miller & Associates Insurance Broking Pty Ltd v BMW Australia Finance Ltd [2010] HCA 31 (silence misleads where there's a reasonable expectation of disclosure); the agent's duty to inform the principal |
| Due care and skill, and its limit: the inspection carries the guarantees of due care and skill and fitness for a disclosed purpose. Where the service isn't of a kind ordinarily acquired for personal, domestic or household use, liability for a failure is limited to supplying it again or paying the cost of that; the clause says "where the law allows it", and nothing limits a right that can't be limited. | Terms s 5; the tax invoice | ACL ss 60, 61, 64, 64A (including 64A(3): not where reliance isn't fair or reasonable) |
| Cancelling: free before payment; a full refund until 24 hours before the visit; inside 24 hours the fee is kept (the mechanic's time is committed), except that it's refunded in full whenever we, the owner or the mechanic call it off, the owner doesn't give access, or the truck is withdrawn or sold first (the clock cancels those). Refunds go to the paying account within 2 business days. A pre-estimate of the cost of a late cancellation, not a penalty. | `cancel_inspection` (`inspection_too_late`), `admin_inspection('cancel')` (refund due), `inspection_sweep()`; `cancelTerms()`; Terms s 5 | Paciocco v ANZ [2016] HCA 28; ACL ss 23-25 (a term reasonably necessary to protect a legitimate interest) |
| A tax invoice for every paid booking (our ABN, the description, the GST-inclusive fee and the GST in it). | `inspectionInvoicePdf`, `/api/inspections/[id]/invoice` | A New Tax System (Goods and Services Tax) Act 1999 s 29-70 |
| Privacy: the mechanic gets the address where the truck is kept and the owner's directions, for the inspection only; the owner is told the time and the booking reference, never the member's name (there's no introduction, unlike a viewing). The report is served only to the member who booked it, through a link that lasts 5 minutes. | `admin_inspection` notices; `/api/inspections/[id]/report`; Privacy policy | Privacy Act 1988 (APPs 6, 11) |
| Who can do it: Queensland has no licensing scheme for motor repairers or pre-purchase inspectors (New South Wales and Western Australia license repairers: check before offering it there). The mechanic works on the owner's site, so our work health and safety duties go with them, and our insurance must cover the service. | Launch list | Work Health and Safety Act 2011 (Qld) s 19; Motor Dealers and Repairers Act 2013 (NSW); Motor Vehicle Repairers Act 2003 (WA) |

## Governing law

Queensland (where the business and the auctions are run from; business days and times are Brisbane's). Each document
says nothing takes away the protections of the buyer's or seller's own state.

## What only Super Trucker can supply before launch

- The licences actually held in each launch state (settings `business.licences`; shown in the footer, the Terms and the
  live room): Queensland, a motor dealer licence plus a chattel auctioneer licence held by the employee who conducts the
  auctions; New South Wales, a motor dealer licence (tell Fair Trading it trades online, and show the number on the site
  and ads); Western Australia, a motor vehicle dealer's licence covering goods vehicles (with consignment approval) and
  an auctioneer's licence under the Auction Sales Act 1973 (section 18). List only in states where they're held.
- For the Queensland launch, only the Queensland licences are needed; New South Wales and Western Australia wait until
  theirs are held (switch them on in `selling.states`).
- The licensed auctioneer, whose name goes on each live sale.
- The sales consultants who call bidders and sellers: each a registered motor salesperson employed by the company (a
  contractor can't do it under a salesperson's registration), or the licensee (section 1).
- The mobile mechanic service (section 19): qualified heavy-vehicle mechanics (employed, or engaged under a written
  agreement), the report template (what was checked, what couldn't be, photos), the fee (`selling.mechanic_fee`), and
  insurance that covers it (public liability and professional indemnity).
- The trust account(s) for buyer and seller money in each launch state, and the audit arrangements each requires.
- The company's legal name, ABN, GST registration and business address (environment settings). The legal name
  shows as "[Company name Pty Ltd]" until it's set, and Site health should refuse to go live with it.
- The name "Super Trucker": search the Australian trade marks register (a United States "SUPERTRUCKER" mark exists; the
  Australian register wasn't checked from here), register the business name with ASIC if the company trades under
  it, and choose the domain. Until a new domain is set the site, emails and app links stay on tyrebiter.com.au
  (`NEXT_PUBLIC_SITE_URL`, `EMAIL_FROM`, `NEXT_PUBLIC_SUPPORT_EMAIL`), and the app's bundle id stays au.com.tyrebiter.app.
- The SMS sender: since 1 July 2026 a branded sender ID must be registered on the ACMA's SMS Sender ID Register (through
  Twilio) or messages show as "Unverified", and an alphanumeric sender ID is at most 11 characters, so "Super Trucker"
  won't fit: register "SuperTruckr" (or send from a number) once the business name is registered.
- Public liability and professional indemnity insurance for the business (nobody from Super Trucker attends viewings
  or handovers, but the business arranges them, and its mobile mechanic does go to the truck).
- Only if depot listings are used again: the transport partner and depot agreements and in-transit insurance.
- Watch items for later states: Victoria's tighter auction-house rules (announced 11 July 2026); each other state's
  "use or permit" offence for unregistered vehicles (section 14).

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
- Transferring a Queensland registered vehicle, trailer, caravan or boat online: https://www.qld.gov.au/transport/registration/transfer/online
- Transfer a vessel registration (NSW): https://www.nsw.gov.au/driving-boating-and-transport/boat-and-vessel-registration/transfer-registration
- Submit a notice of disposal for a vessel (Service NSW): https://www.service.nsw.gov.au/transaction/submit-notice-disposal-vessel
- Buy, sell or transfer a boat or jet ski (VicRoads): https://www.vicroads.vic.gov.au/buy-sell-transfer/buy-sell-transfer-vessel
- Transfer a vessel (WA Department of Transport): https://www.transport.wa.gov.au/marine/recreational-boating/boat-registration/transfer-vessel
- Transfer a boat registration (SA): https://www.sa.gov.au/topics/boating-and-marine/boat-registration/transfer-boat-registration
- Transfer a boat registration (Service Tasmania, for MAST): https://www.service.tas.gov.au/services/boats-and-fishing/boat-and-personal-water-craft-registrations/transfer-a-boat-registration/
- Transport Operations (Road Use Management—Vehicle Registration) Regulation 2021 (Qld), s 10 (use of unregistered vehicles) and s 73 (unregistered vehicle permits): https://www.legislation.qld.gov.au/view/whole/html/inforce/2021-09-17/sl-2021-0113
- Queensland unregistered vehicle permit (eligibility, duration, CTP, online application): https://www.qld.gov.au/transport/buying/unregistered/uvp
- Slattery Grays user agreement (cl 5.3 permits; cl 8 collection and storage): https://slatteryauctions.com.au/legal/user-agreement
- Manheim, How to Buy Cars and Commercial Vehicles at Auction (permits available at their sites): https://www.manheim.com.au/opalcmsassets/manheim/brochures/how-to-buy-cars-and-commercial-vehicles-at-auction.pdf
- Grays, Unregistered Vehicles (buyer obtains the permit; carrier avoids the need): https://support.grays.com/hc/en-au/articles/900004985823-Unregistered-Vehicles
- Queensland Government, apply for a motor dealer licence (no auctions without a chattel auctioneer licence): https://www.qld.gov.au/law/laws-regulated-industries-and-accountability/queensland-laws-and-regulations/regulated-industries-and-licensing/regulated-industries-licensing-and-legislation/motor-industry-regulation/get-a-motor-licence-or-registration/apply-for-a-motor-dealer-licence
- Queensland Government, motor licences and registration (motor salespersons are registered, and work only as employees): https://www.qld.gov.au/law/laws-regulated-industries-and-accountability/queensland-laws-and-regulations/regulated-industries-and-licensing/regulated-industries-licensing-and-legislation/motor-industry-regulation/get-a-motor-licence-or-registration
- RACQ, the facts about safety certificates (a certificate from an approved inspection station isn't a mechanical inspection): https://www.racq.com.au/articles/car-maintenance/the-facts-about-car-safety-certificates
- Consumer Protection WA, motor vehicle repairers licensing: https://consumerprotection.wa.gov.au/motor-vehicle-repairers-licensing
- Competition and Consumer Act 2010 (Cth), Schedule 2 (Australian Consumer Law) ss 60, 61, 64A: https://www.legislation.gov.au/C2004A00109/latest/text
- Miller & Associates Insurance Broking Pty Ltd v BMW Australia Finance Ltd [2010] HCA 31: https://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/cth/HCA/2010/31.html
- A New Tax System (Goods and Services Tax) Act 1999 (Cth) s 29-70 (tax invoices): https://www.legislation.gov.au/C2004A00446/latest/text
