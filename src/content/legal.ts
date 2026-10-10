// Legal and help copy, in plain English. DRAFT: have an Australian lawyer review before launch
// (licensing in each state, ACL wording, unfair contract terms, state registration rules).
// {{TOKENS}} are filled from Admin → Fees & settings by fillLegal(), so the pages always match the fees charged.

export const TERMS_VERSION_LABEL = "Version 10 October 2026";

export const TERMS: [string, string, string[]][] = [
 ['t-summary','The short version',[
  'Tyrebiter runs each auction as the seller’s agent. The contract of sale is between you and the seller; we run the sale and collect the money.',
  'Vehicles stay at the seller’s location. In-person viewings aren’t available; you can order an independent mobile inspection before you bid, or ask the vehicle’s consultant to organise one. You own the vehicle once you’ve paid in full. The registration is then transferred into your name, and you collect from the seller’s location.',
  'Vehicles are sold <b>as is, where is</b>. Condition reports and grades are a guide only. But the facts in a listing (make, model, year, VIN, odometer reading, transmission, fuel, listed features, write-off status, finance, visible damage) must be right: we check them against the vehicle and the PPSR before it’s listed, and if they’re materially wrong you can claim (section 12). Your rights under the Australian Consumer Law aren’t affected (section 4).',
  'Registering and bidding are free. To bid you need a verified mobile, a card on file and a verified ID.',
  'Bids are binding and can’t be withdrawn. If you win, payment is taken straight away: under {{CARD_LIMIT}} in full from your card; {{CARD_LIMIT}} or more, a deposit by card (you lose it only if you don’t pay) and the balance by bank transfer or PayID within {{PAY_DAYS}} business days.',
  'Fees: buyer’s premium of {{PREMIUM}} plus GST and an admin fee of {{ADMIN_FEE}}. No card surcharge.',
  'You get clear title: any finance owing is paid out of the sale before the seller is paid. Risk stays with the seller until you collect (or until your collection window ends, if you don’t collect in time).',
  'There is no cooling-off period for auction purchases.',
  'We take payment by card and bank transfer only, never cash or cheques, and only into the account shown on your invoice page. Overdue balances may attract interest at {{LATE_INTEREST}} a year; there are no other late fees.',
  'You collect from the seller’s place at a booked time, with whatever the vehicle needs to be moved safely (section 16).']],
 ['t-agent','1. Who you are dealing with',[
  '{{LEGAL_NAME}} (ABN {{ABN}}) (“Tyrebiter”, “we”) runs online auctions for vehicles owned by private sellers and businesses. We act as the seller’s agent under a written agency agreement. We don’t own the vehicles we list.',
  'When your bid wins, you use Buy Now, or the seller accepts your referred bid or your offer, a binding contract of sale is formed between you and the seller on these terms. We collect payment from you for the seller and hold it until the sale completes.',
  'We hold a motor dealer and/or auctioneer licence where the law in each state requires one: {{LICENCES}}.',
  'Each listing says whether the seller is a <b>private seller</b> (a person selling their own vehicle) or a <b>business seller</b> (a business selling a vehicle it owns, such as a fleet or company vehicle). It can affect your consumer rights (section 4).']],
 ['t-location','2. Where vehicles are',[
  'Every vehicle is at the seller’s home or business, not a Tyrebiter yard. The listing shows the suburb and state.',
  'We give the full address only to the buyer once they’ve paid in full, the registration transfer is done and the collection time is confirmed, and to the inspector for a mobile inspection. Don’t visit a seller’s address before collection, and don’t contact a seller to deal outside Tyrebiter.']],
 ['t-condition','3. Listings and condition reports',[
  'Each listing has two kinds of information. <b>Facts we check</b>: make, model, build year, VIN, registration, the odometer reading, transmission, fuel type, the features listed, dash warning lights, whether it starts and drives, that visible damage is photographed, and the PPSR search (finance, written-off and stolen status). <b>Condition information</b>: our visual walkaround, visual grades (A to E), and what the seller declared in writing (accidents, flood or hail, modifications, previous use, recalls, known faults, service history, keys).',
  'Before a listing goes live, our staff check it against the vehicle itself: the VIN plate, the build date, the odometer (photographed with the ignition on), the transmission, the fuel type, every feature listed, the dash warning lights, whether it starts and drives, and that all visible damage is photographed and the photos are of this vehicle. The listing shows these as checked by Tyrebiter. See <a class="blue" href="/listing-promise">How we check listings</a>.',
  '“Starts and drives” means it started and moved under its own power when we checked it. It isn’t a road test or a mechanical inspection. “Starts, but doesn’t drive”, “Doesn’t start” and “Not tested” mean what they say: allow for transport.',
  'Corrections: if we find a mistake in a listing, we correct it straight away and show the change, with the date, in “Changes to this listing”. This covers the key facts, the title, the description, the location and the damage list. We tell everyone who has bid on or is watching the vehicle, and if bidding would close within 24 hours, we extend it so there are at least 24 hours left. If you bid before a correction and it changes your mind, call the consultant on the listing (or us) before bidding closes and we’ll cancel your bids. If the correction comes after bidding has closed but before the seller accepts (while they consider the highest bid, or during offers), tell us before they accept and we’ll release you from your bid or offer. [LAWYER TO CONFIRM]',
  'Our condition reports come from a visual walkaround at the seller’s location. They are not mechanical, structural, electrical or roadworthy inspections, and they may not show every fault. Faults may exist that neither we nor the seller know about.',
  'Visual grades describe how the vehicle looks. They don’t assess mechanical condition. Grade definitions are in the Help centre.',
  'Odometer: we photograph the reading with the ignition on, so the listing matches the dash. We can’t tell whether the dash shows the vehicle’s true distance (for example after a replaced instrument cluster), so the seller declares in writing whether they know of any reason it may be inaccurate. Sellers may move the vehicle a little while it’s listed to keep it in condition; if the reading goes up by more than 50 km, we correct the listing.',
  '“Year” means the build year unless the listing says it’s the compliance date. Keys, service books, manuals and accessories are included only if the listing says so. Any remaining manufacturer’s warranty is between you and the manufacturer. Reports supplied by the seller (for example an old roadworthy or a mechanic’s report) are passed on as the seller gave them and aren’t checked or warranted by us.',
  'Used vehicles, especially older and commercial ones, often need repairs. Satisfy yourself before you bid, for example by ordering an independent mobile inspection.']],
 ['t-asis','4. As is, where is, and your consumer rights',[
  'Every vehicle is sold as is, where is: in its condition and location at the end of the auction, with any faults that aren’t described. Neither Tyrebiter nor the seller promises anything about the vehicle’s mechanical condition, roadworthiness or history beyond the facts in section 3 and the seller’s written declarations, except where the Australian Consumer Law says otherwise (below).',
  'Nothing in these terms excludes, restricts or changes any right you have under the Australian Consumer Law that can’t lawfully be excluded. Which consumer guarantees apply depends on how you buy and who the seller is:',
  '<b>Bought at auction</b> (your bid wins, or the seller accepts your referred bid): Tyrebiter sells as the seller’s agent, so it’s a sale by auction. The guarantees of clear title, undisturbed possession and no undisclosed securities apply. The guarantees of acceptable quality, fitness for purpose and matching the description don’t apply to sales by auction.',
  '<b>Bought outright</b> (Buy Now, an accepted offer, or an offer to the next bidder) <b>from a business seller</b>: it isn’t a sale by auction, so the consumer guarantees, including acceptable quality, may apply as well as our claims process.',
  '<b>Bought outright from a private seller</b>: the guarantees of clear title, undisturbed possession and no undisclosed securities apply. The guarantees about quality generally don’t apply to a sale by a private person who isn’t in business. [LAWYER TO CONFIRM FOR EACH SALE PATH AND SELLER TYPE, including whether a referred bid the seller accepts after bidding closes is a sale by auction]',
  'Whichever way you buy, if a listing is misleading you keep your rights under the Australian Consumer Law, and you can claim under section 12. Any remaining manufacturer’s warranty transfers with the vehicle. Statutory dealer warranties generally don’t apply to sales by auction. You don’t need to buy an extended warranty to have the rights above.',
  'No cooling-off period applies to auction purchases. [LAWYER TO CONFIRM for Buy Now and accepted offers in each state]']],
 ['t-inspect','5. Inspections',[
  'Buyers can’t view or test drive vehicles in person. Before you bid you can order an independent mobile inspection through Tyrebiter: a mechanic from our inspection partner inspects the vehicle at its location and sends you a written report with photos.',
  'The inspection provider is independent of Tyrebiter and the seller. Their report is their opinion of the vehicle’s condition on the day, under their own terms, and you pay them directly. We may receive a fee from them. A report doesn’t change these terms or the as is, where is basis of sale.',
  'Ordering an inspection doesn’t extend the auction. Allow time for it before bidding closes. For anything else about a vehicle, contact the consultant shown on the listing.']],
 ['t-bidding','6. Registering and bidding',[
  'You must be 18 or over and give your legal name, date of birth, residential address and an Australian mobile. Business buyers can add their company name and ABN for their tax invoice.',
  'Before your first bid you verify your mobile with an SMS code, add a card, and verify your identity with a driver licence or passport and a selfie, through Stripe Identity. Your name and date of birth must match your ID.',
  'One account per person. Don’t bid for someone else unless we’ve approved it in writing. Don’t use more than one account, collude with other bidders, or bid to inflate a price.',
  'Every bid is a binding offer to buy at that amount plus the buyer’s premium and fees. Bids can’t be withdrawn. We ask you to confirm each bid and show the all-in cost before it’s placed.',
  'If you set a maximum, we bid for you one increment at a time, only as far as needed to keep you in front, up to your maximum. Nobody else sees your maximum. If two bidders set the same maximum, the one who set it first wins.',
  'Going, going, gone: any bid in the last {{EXTEND}} minutes extends the auction to {{EXTEND}} minutes after that bid. It closes once {{EXTEND}} minutes pass with no new bid.',
  'Our alerts (outbid, ending soon) are sent as fast as we can, but delivery isn’t guaranteed. Keep an eye on auctions you care about.',
  'Reserve: if the auction ends below the seller’s reserve, the highest bid is referred to the seller, who has {{REFERRAL_DAYS}} business days to accept. Your bid stays binding until they decide. If they accept, it’s a win. If they decline or don’t answer in time, offers open.',
  'Make an Offer: during the offer period ({{OFFER_DAYS}} business days) you can offer an amount. It stays binding until the seller declines it, you replace it with a higher offer, or the period ends. If the seller accepts, it’s a win.',
  'Buy Now: where shown, you can buy at the Buy Now price until bidding reaches it. The auction ends immediately and payment is taken as for a win. The buyer’s premium and admin fee apply to Buy Now purchases.',
  'Sellers, their associates and anyone using the seller’s mobile can’t bid on the seller’s vehicle. We monitor bidding and may cancel bids, void sales and close accounts for shill bidding or collusion.',
  'If there’s a technical fault or an obvious error in a listing, we may extend, pause, cancel or reopen an auction, and we’ll tell affected bidders. If we cancel someone’s bids (for example they bid before a material correction and asked us to, or for shill bidding), the price is worked out again from the remaining bids, as if those bids were never made.',
  'Fleet and business sales: some vehicles are grouped in a sale. Each vehicle is still its own auction and closes at its own time, usually a few minutes apart; a late bid extends only that vehicle.']],
 ['t-fees','7. Buyer’s premium and fees',[
  'There’s no fee to register, watch or bid. Fees apply only to a vehicle you buy.',
  'Buyer’s premium: {{PREMIUM}} of the price, plus GST on the premium. Admin fee: {{ADMIN_FEE}} per vehicle (includes GST).',
  'No card surcharge applies. (Surcharges on Visa, Mastercard and eftpos are banned in Australia from 1 October 2026.)',
  'GST on the vehicle: private sellers don’t charge GST, so the price has none. If the seller is GST-registered and selling a business asset, the listing says the price includes GST. Your tax invoice shows the GST.',
  'Storage of {{STORAGE}} per day applies if you don’t collect on time (section 9).',
  'The all-in amount is shown before you confirm any bid, offer or Buy Now.']],
 ['t-payment','8. Payment',[
  'Keep a valid card on your account to bid. By bidding, you authorise us to charge it without asking again when you win.',
  'Total under {{CARD_LIMIT}}: the full amount is charged to your card as soon as the sale is made.',
  'Total of {{CARD_LIMIT}} or more: a deposit of {{NRD_LOW}} (or {{NRD_HIGH}} if the total is {{NRD_SPLIT}} or more) is charged to your card straight away and counts towards the price. Pay the balance by bank transfer (or PayID if shown) within {{PAY_DAYS}} business days, quoting your invoice number.',
  'The deposit isn’t refunded if the sale is cancelled because you didn’t pay (section 11). It is refunded in full if the sale is cancelled for any other reason, for example an upheld claim, a title problem, damage before handover or our mistake.',
  'If a card charge is declined, we’ll text you a secure link. Pay within 1 business day or we may cancel the sale under section 11.',
  'How to pay: by card through Tyrebiter, or by bank transfer or PayID to the account shown on your invoice page. We don’t accept cash or cheques. Your balance is on time if you send it by the due date and it clears in the normal course. We release the vehicle once the money has cleared into our account.',
  'Pay from an account in your own name or your business’s name. If someone else is paying for you, tell us first: we may ask for proof and hold the release until we’re satisfied. It protects you and the seller from fraud.',
  'Pay Tyrebiter only, never the seller. Money paid to the seller or to any account other than the one on your invoice page isn’t a payment to us, unless the wrong details came from us. We will never change our bank details by email, SMS or phone. If anyone asks you to, don’t pay: call us on {{PHONE}}.',
  'Interest: if your balance is overdue, we may charge interest on the overdue amount at {{LATE_INTEREST}} a year, worked out daily from the due date until it’s paid. We don’t charge any other late-payment fee.',
  'Card disputes: if you ask your bank to reverse a card payment you authorised for a vehicle you won, the sale is treated as unpaid under section 11. This doesn’t affect a dispute about a charge you didn’t authorise.',
  'Refunds go back to the card or account you paid from. If you owe us something under these terms (for example storage), we may take it out of a refund before we pay it, and we’ll show you how it was worked out.',
  'You receive a tax invoice by email when you win, and a receipt when you’ve paid in full.']],
 ['t-title','9. Title, risk and collection',[
  'Title: we search the PPSR before listing. Any registered finance is paid out of the sale price before the seller is paid, so you receive the vehicle free of registered security interests once you’ve paid in full. If a title problem appears that we can’t fix, we’ll cancel the sale and refund everything you paid.',
  'Ownership (title) passes to you when we receive full payment in cleared funds. The registration transfer that follows puts the registration into your name.',
  'Risk passes to you at handover, or at the end of your collection window if you haven’t collected, whichever comes first. Until then the seller must look after the vehicle with reasonable care, keep it in the same condition and not use it. If it’s damaged, stolen or materially changed before handover, you may cancel for a full refund. Because the vehicle is in your name once the registration is transferred, arrange your own insurance from that day.',
  'Tolls, fines and charges from before handover are the seller’s. If one is sent to you, tell us and we’ll help you transfer it to the seller.',
  'If the seller doesn’t hand over the vehicle, or the sale is cancelled after the registration transfer because of the seller or us, we’ll cancel the sale, refund everything you paid and arrange for the registration to go back to the seller. You can also recover the transfer fee and stamp duty you paid (where your state doesn’t refund them) and reasonable costs you can’t get back, such as a booked carrier, from whoever caused it.',
  'Registration transfer: after you pay in full, and before you collect, the vehicle goes into your name. Registered vehicles: the seller lodges their part with their state’s transport authority, you transfer the registration into your name (paying the transfer fee and duty) and upload the confirmation from your invoice, and we check it. If you can’t or don’t want to register it in that state, you can take it unregistered: the seller cancels the registration and keeps the plates. Unregistered vehicles: you confirm the certificate of sale in your name, which is your record of ownership, and how the vehicle will be moved (carrier, trailer or permit).',
  'Collection: once ownership is transferred, book a time from your invoice. We confirm it with the seller and send you the address and a 6-digit release code. Collect within {{COLLECT_DAYS}} business days of the registration transfer being completed (we can agree more time for interstate buyers and transport companies if you ask before the window ends).',
  'Whoever collects must be named on your booking and show photo ID matching that name. A transport company must quote your booking reference. The seller only hands over the vehicle when given the release code. You’re responsible for anyone you send to collect (a friend, a driver or a transport company) as if they were you.',
  'The keys, books and accessories listed are handed over with the vehicle. Anything else the seller leaves in it isn’t part of the sale.',
  'Check the vehicle against the listing before you accept the keys. Handover starts the claim window in section 12.',
  'Storage: if you don’t collect within the window, storage of {{STORAGE}} per day applies from the next day and must be paid before release. It’s passed to the seller for keeping the vehicle. There’s no storage for any day the delay was caused by us or the seller (for example the seller wasn’t available at a booked time), and none before the registration transfer is complete.',
  'Abandonment: if you still haven’t collected {{ABANDON_DAYS}} business days after we give you written notice, we may sell the vehicle for you as the uncollected goods laws in the seller’s state allow, and pay you what’s left after storage, the reasonable costs of selling it and anything else you owe us under these terms. [LAWYER: state uncollected goods laws]']],
 ['t-states','10. Registration, transfer and roadworthy (rules differ by state)',[
  'Every listing says whether the vehicle is registered (with its plate, state and expiry) or unregistered (sold without plates).',
  'You pay transfer fees, stamp duty, registration and plate fees, and any late-transfer penalties, and you must transfer the registration within the time the state requires (usually 14 days). The seller lodges their part (a notice of disposal, or starting the transfer online) when the sale is paid. Your invoice shows the steps and links for the vehicle’s state.',
  'Unregistered vehicles can’t be driven on the road. Move it by carrier or trailer, or under an unregistered vehicle permit from the state’s transport authority. To register it, apply to your state’s transport authority with the certificate of sale and any inspection it requires.',
  'Roadworthy and safety certificates: vehicles are sold without one unless the listing says otherwise. In some states a certificate is needed to transfer registration (for example Victoria), and in Queensland a safety certificate is generally needed to offer a registered light vehicle for sale unless an exemption applies. Where the seller’s state requires one for the sale, the listing says whether it’s provided. Otherwise getting one is your responsibility. [LAWYER TO CONFIRM EACH STATE AND TERRITORY]',
  'Interstate buyers: registration usually transfers only to someone who can register it in that state. If you can’t, choose to take it unregistered: the seller cancels the registration and keeps the plates, and you register it in your state, which may need an inspection.',
  'Remaining registration isn’t refunded or adjusted between buyer and seller. The listing shows any defect notice or registration condition the seller has told us about.',
  'Written-off vehicles: if a vehicle is on a written-off vehicle register, the listing says so. Statutory write-offs can never be re-registered. Check whether a repairable write-off can be registered in your state before you bid.']],
 ['t-default','11. If a buyer doesn’t pay or collect',[
  'If you don’t pay on time, we’ll remind you by SMS and email. If you still haven’t paid 1 business day after that reminder, we may cancel the sale, offer the vehicle to the next highest bidder or relist it, and suspend your account.',
  'Offer to the next bidder: if a winning buyer doesn’t pay, we may offer the vehicle to the next highest bidder at their highest bid. It’s an offer, not an obligation: it’s only binding if they accept it before it expires (usually 24 hours), and then payment is taken as for a win. Each offer shows the all-in price.',
  'If we cancel because you didn’t pay, a cancellation fee of {{CANCEL_FEE}} applies where the invoice total is over {{CANCEL_ABOVE}}. Our payment reminder tells you about it, and we may charge it to the card on your account. Where you paid a deposit, we keep the deposit instead: one or the other, never both. These amounts are our genuine estimate of the costs of a failed sale (relisting, the seller’s lost time, payment costs).',
  'If the vehicle then sells for less, you may also have to pay the difference and the reasonable costs of selling it again, less the deposit or cancellation fee we kept. We’ll give you a statement showing how it’s worked out, and we won’t claim more than our and the seller’s actual loss.',
  'Anything you owe under these terms is a debt. If it stays unpaid, we may refer it to a debt collector or take legal action, and recover our reasonable costs of doing so, within what the law allows.',
  'Not collecting on time: storage and abandonment are covered in section 9.']],
 ['t-claims','12. If the vehicle isn’t as described (claims)',[
  'You can make a claim if the vehicle is <b>materially different</b> from its listing, for example: a different make, model, build year or VIN; manual listed as automatic (or the reverse); a different fuel type; an undisclosed written-off or stolen status; undisclosed finance; an odometer materially different from the listing; a key feature listed that isn’t there; or major damage the listing didn’t show or mention.',
  'Claims don’t cover general wear, mechanical faults a walkaround couldn’t reveal, or anything disclosed in the listing or the seller’s declarations.',
  'How: lodge the claim from your invoice, with photos, before you accept handover, or within {{CLAIM_DAYS}} business days after handover. For a wrong VIN or build year, an undisclosed written-off or stolen status, undisclosed finance or odometer tampering, which can take longer to find, contact us within 30 days of handover. Don’t modify, repair or use the vehicle (beyond getting it home) while we review it. Completing the registration transfer is fine. This window is for our claims process; it doesn’t take away any right you have under the Australian Consumer Law.',
  'We compare the vehicle with the listing as it was at the moment of sale (we keep a copy), give the seller the chance to respond, and give you a decision in writing within 2 business days of receiving what we need. If your claim is upheld, you can cancel the sale for a full refund of everything you paid, or agree a price adjustment. The seller’s payout is held while a claim is open.',
  'If you cancel after collecting, return the vehicle to the seller’s place in the condition you received it, or let us arrange its return; we’ll agree reasonable return costs with you as part of the claim. Disputes with the seller about the vehicle go through this process first, so we can help resolve them.']],
 ['t-liability','13. Our liability',[
  'Nothing in these terms excludes, restricts or changes any right or remedy you have under the Australian Consumer Law, or any other law, that can’t lawfully be excluded.',
  'Subject to that: we’re responsible for loss caused by our own negligence, fraud or breach of these terms. We aren’t responsible for a vehicle’s condition beyond what section 4, section 12 and the law provide; for independent inspectors, carriers, lenders, insurers and other partners you choose to use (their own terms apply); or for events outside our reasonable control (section 17).',
  'Neither we nor the seller is responsible for indirect loss that wasn’t reasonably foreseeable when the sale was made, such as lost profits or lost business.',
  'Where the law lets us limit our liability for a service we supply, it’s limited to supplying the service again or paying the cost of having it supplied again. This doesn’t limit your rights under section 12 or under the Australian Consumer Law.']],
 ['t-privacy','14. Privacy',[
  'We collect your details to run auctions, verify identity, process sales and prevent fraud. We share only what’s needed: your name (and your collector’s) with the seller for collection and the transfer papers. See our <a class="blue" href="/privacy">Privacy policy</a>.']],
 ['t-complaints','15. Complaints and disputes',[
  'Contact us first on {{PHONE}} or {{EMAIL}}. We acknowledge complaints within 1 business day and aim to resolve them within 10 business days.',
  'If you’re not happy with our answer, ask for a review by a manager who wasn’t involved. We’ll give you our final answer in writing, with our reasons.',
  'If that doesn’t resolve it, you can contact the fair trading or consumer affairs agency in your state or territory, or apply to your state’s civil and administrative tribunal or small claims court. If we both agree, we can also use an independent mediator, with the cost shared equally.']],
 ['t-site','16. Collecting from the seller’s place',[
  'You, and anyone collecting for you, go to the seller’s home or business only at the confirmed time, follow the seller’s reasonable safety directions, and leave the property as you found it.',
  'Bring what the vehicle needs to be moved safely: a driver licensed for its class, a suitable trailer, tow truck or carrier, and the right straps or equipment. The seller doesn’t have to load the vehicle, drive it for you or lend you equipment.',
  'Trucks, buses, machinery and anything that needs lifting gear must be moved by a person or business qualified to do it, with their own insurance. Tell us when you book, and we’ll agree the arrangements with the seller.',
  'Don’t repair it, remove parts or test drive it at the seller’s place, and don’t drive an unregistered vehicle on a road unless you have a permit.',
  'You’re responsible for damage or injury that you or your collector cause at the seller’s place, except to the extent the seller or we caused it.',
  'If collection can’t go ahead safely (for example the vehicle can’t be reached, or the site is unsafe), stop and call us. We’ll arrange another time, and your collection window is extended.',
  'Machinery, trucks and plant: before you use it at a workplace, make sure it meets work health and safety laws and any plant registration your state requires. Older machinery can contain hazardous materials (for example asbestos in brakes or gaskets), fluids, gas cylinders or batteries: handle and move them lawfully. Heavy or oversize vehicles must be moved under the heavy vehicle rules, with any permit needed. Anyone you send should carry suitable public liability insurance and follow the seller’s site safety rules.']],
 ['t-errors','17. Errors, outages and events outside our control',[
  'If our website or app stops working near the end of an auction, we’ll extend the auction so everyone has a fair chance, or cancel it and run it again, and we’ll tell the bidders. We’re not responsible for bids that don’t reach us because of your own device, internet connection or settings, so bid early on vehicles that matter to you.',
  'If a listing or an invoice has an obvious mistake that you would reasonably have noticed (for example a Buy Now price missing a zero, or another vehicle’s photos), we may cancel the affected bids or sale and refund everything you paid. We’ll tell you why.',
  'Our system records the time and amount of every bid. If there’s a disagreement about bids, we use those records, and we’ll show you the relevant part if you ask.',
  'Neither we nor the seller is responsible for a delay or failure caused by something outside reasonable control, such as a natural disaster, flood, fire, a public health order, a widespread failure of internet, banking or payment systems, or government action. We’ll tell you as soon as we can, and deadlines for paying, transferring and collecting are extended while it lasts. If it lasts more than 20 business days, you or the seller may cancel the sale, and you get a full refund.']],
 ['t-responsible','18. Your responsibilities',[
  'Give us true information, keep your login private, and tell us straight away if you think someone else has used your account. You’re responsible for bids made from your account, unless they were made after you told us it had been compromised, or because of a failure in our security.',
  'If you buy for a company or business, you confirm you’re authorised to bind it, and it’s responsible for paying. If you weren’t authorised, you’re responsible as if you’d bought the vehicle yourself.',
  'Don’t interfere with an auction: no shill bidding, no colluding with other bidders, and no contacting the seller to deal outside Tyrebiter.',
  'You’ll pay us back for loss we reasonably suffer because you broke these terms or acted fraudulently, or because of something you or your collector did at the seller’s place, including amounts we have to pay the seller or others. This doesn’t apply to the extent the loss was caused by us, the seller or anyone acting for us.']],
 ['t-notices','19. Notices',[
  'We send notices about your bids, purchases and account by email, SMS, app notification or on your account page, using the details on your account, so please keep them up to date. An email or SMS notice counts as received when we send it, unless we learn that it didn’t arrive.',
  'You can send us a notice by email to {{EMAIL}} or through Contact us. Notices about a purchase should quote your invoice number.']],
 ['t-general','20. General',[
  'These terms are governed by the laws of [STATE], Australia. Nothing here stops you from using a tribunal or court in your own state where the law allows.',
  'We may update these terms, and we’ll tell you before we do. A change never applies to a sale already made: the version you accepted when you placed a bid, offer or Buy Now applies to that sale, and we’ll ask you to accept any new version before your next bid. If you don’t want to accept it, you can close your account.',
  'For each purchase, these terms, the listing as it was when the sale was made, and your invoice are the whole agreement. Our <a class="blue" href="/website-terms">Website terms</a> cover using the website and app.',
  'If part of these terms can’t be enforced, it’s read down or left out and the rest still applies. If we don’t enforce a right straight away, we haven’t given it up.',
  '“Business day” means a weekday that isn’t a public holiday in Queensland or a national public holiday. Times are Brisbane time unless we say otherwise.',
  'We may transfer our rights and obligations to a business that takes over our auctions. We’ll tell you if we do, and it won’t reduce your rights.',
  'This version: 10 October 2026.']]
];

export const SELLER_AGREEMENT: [string, string, string[]][] = [
 ['s-parties','1. This agreement',[
  'This Seller Agency Agreement is between you (the “seller”) and {{LEGAL_NAME}} (ABN {{ABN}}) (“Tyrebiter”). It applies to the vehicle named in your listing link. You sign it electronically, and we record the date, time and device.',
  'You appoint Tyrebiter as your exclusive agent to sell the vehicle by online auction from your location, and during any referral and offer period that follows.']],
 ['s-exclusive','2. Exclusive period',[
  'While the vehicle is listed, and for {{EXCLUSIVITY_DAYS}} days after the listing ends, you agree not to sell it, except through us, to anyone we’ve named to you in writing or who tells you they found it on Tyrebiter. If you do, you pay our seller fee on your sale price, plus the buyer’s premium and admin fee we would have earned on that price.']],
 ['s-fees','3. Fees',[
  'Seller fee: {{SELLER_FEE}}. It’s earned only when the vehicle sells, and it’s taken from the sale proceeds.',
  'There’s no charge for the appraisal, photos, condition report or PPSR search, unless we agree otherwise in writing.',
  'Buyers pay us a buyer’s premium and admin fee. Those are ours and don’t reduce your proceeds.']],
 ['s-reserve','4. Reserve and your decisions',[
  'You set the reserve when you sign. It stays secret from bidders. You may lower it at any time, but you can’t raise it once bidding has started.',
  'You authorise us to accept any bid at or above the reserve. If there’s no reserve, the vehicle sells to the highest bidder.',
  'If bidding ends below the reserve, we send you the highest bid. You have {{REFERRAL_DAYS}} business days to accept or decline in your seller dashboard. If you don’t respond in time, it counts as a decline and we open offers for {{OFFER_DAYS}} business days. Accepting a referred bid or an offer in your dashboard is binding.']],
 ['s-nobid','5. No seller bidding',[
  'You, your family, employees and associates must not bid on the vehicle or ask anyone to bid for you. If that happens, we may void the sale and cancel the listing, and our seller fee plus the buyer’s premium is payable on the higher of the highest bid and your reserve, plus our reasonable costs.']],
 ['s-warranties','6. What you promise us (and buyers rely on)',[
  'You are the owner of the vehicle, or you are authorised in writing by every owner (or by the company or trust that owns it) to sell it.',
  'The vehicle is free of security interests and charges, except finance you’ve told us about. You authorise us to pay that finance out from the sale proceeds and to deal with your lender to do so.',
  'The vehicle isn’t stolen, and isn’t written off unless you’ve told us. The VIN and engine number are genuine and haven’t been altered.',
  'You don’t know of any tampering with the odometer, other than anything you’ve told us.',
  'There’s no defect notice, registration condition or unpaid toll or fine on the vehicle that you haven’t told us about.',
  'Your answers to our questions (accidents, flood or hail damage, modifications, warning lights, whether it starts and drives, known faults, keys and service books) are true and complete as far as you know, and you’ve told us about every fault you know of.',
  'You’ve told us whether you’re selling as a private person or in the course of a business. Buyers see this, and it affects their consumer rights.',
  'You’ve told us about any use as a taxi, rideshare, hire car, driving-school or police vehicle, any safety recall you know hasn’t been fixed, and any modification that wouldn’t pass a roadworthy inspection. These answers are shown on the listing.',
  'Any photos, videos or documents you give us are of this vehicle, are accurate, and are yours to give.',
  'Tolls, fines and registration charges up to handover are yours.',
  'You must tell us straight away if anything you’ve told us stops being true.']],
 ['s-obligations','7. Looking after the vehicle until handover',[
  'Keep the vehicle at the listed address, insured until the registration is transferred, and in the same condition as when it was photographed. While it’s listed, only move it as needed to keep it in condition, and tell us if the odometer goes up by more than 50 km so we can correct the listing. Don’t use it at all once it’s sold.',
  'Give our inspection partner access for mobile inspections we arrange (we’ll call to agree a time), and give the buyer access to collect at the time we confirm. Buyers can’t visit to view the vehicle. Keep the battery charged and some fuel in the tank.',
  'Keep safe access to the vehicle for the inspector and the collector: a clear, safe spot to load it, and let us know in advance about dogs, locked gates, steep or soft ground, or anything else they should know. You’re not required to load the vehicle or lend equipment, and you can refuse a collection that would be unsafe (tell us straight away).',
  'The vehicle stays at your risk until handover. If it’s damaged, stolen or changes materially before handover, tell us immediately. The buyer may then cancel.',
  'At handover: check the collector’s photo ID matches the name we give you, and only hand over the vehicle when they give you the release code, which you enter on your handover page. Hand over every key, book and accessory in the listing. Remove any toll tag and personal data. Never accept money from the buyer directly.',
  'Transfer: when the buyer has paid in full, lodge your part of the registration transfer (a notice of disposal, or starting the transfer online) within the time your state requires. Your seller dashboard shows the steps and links, and your consultant gives you the buyer’s details the form needs. If the buyer is taking the vehicle unregistered, cancel the registration and keep the plates. The buyer only collects once ownership is transferred.']],
 ['s-withdraw','8. Withdrawing the vehicle',[
  'You can withdraw the vehicle free of charge before the auction goes live.',
  'After it goes live, you can withdraw it by telling us, until a bid meets the reserve. A withdrawal fee of {{WITHDRAWAL_FEE}} applies to cover the costs of photography, the report, the PPSR search and marketing. There’s no fee if you withdraw because of something outside your control (for example the vehicle is stolen or damaged through no fault of yours). Once a bid at or above the reserve has been made, the vehicle can’t be withdrawn.']],
 ['s-default','9. If the buyer doesn’t pay',[
  'If the buyer doesn’t pay, we may offer the vehicle to the next highest bidder (with your agreement if it’s below your reserve) or relist it without a new seller fee.',
  'If we keep a deposit or charge a cancellation fee to a buyer who didn’t pay, we pay you half of it. You authorise us to deal with the buyer first. If we decide not to pursue the buyer, or haven’t recovered what they owe within 30 days, you may pursue them yourself, and we’ll give you the records you need.']],
 ['s-settlement','10. Getting paid',[
  'The buyer pays Tyrebiter. We pay you the sale price less our seller fee (plus GST on it), any finance we pay out to your lender, and any other costs you’ve agreed to in writing.',
  'We pay you within {{PAYOUT_DAYS}} business days after both (a) the buyer has collected, and (b) the buyer’s claim window ({{CLAIM_DAYS}} business days after handover) has closed with no open claim. You get a settlement statement.',
  'We pay only into the bank account you gave us when you signed, which we confirm with you by phone. We’ll never ask you to change it by email.',
  'If the finance owing is more than the sale price, you must pay your lender the difference before we can complete the sale.',
  'Sale money is held for you in [TRUST / SEPARATE ACCOUNT - LAWYER TO CONFIRM] until it’s paid out.']],
 ['s-claims','11. Buyer claims and clawback',[
  'If a buyer claims the vehicle is materially different from the listing (see the Terms of Sale, section 12), we hold your payout while we review it, using the listing as it was at the moment of sale and your written answers. We send you the claim and the evidence and give you 2 business days to respond before we decide. You can dispute our decision through our complaints process or a tribunal.',
  'If the claim is upheld because of something you told us (or didn’t tell us), as opposed to our own checks, you agree that the sale may be cancelled and the buyer refunded, that you’ll take the vehicle back (and the registration, if it was transferred), and that you’ll repay any money already paid to you, the buyer’s transfer costs they can’t recover, and our reasonable costs. You’ll pay us back for claims, losses and costs caused by a breach of your promises in section 6, except to the extent we caused them.']],
 ['s-unsold','12. If it doesn’t sell',[
  'Nothing is payable if the vehicle doesn’t sell, unless you withdrew it (section 8) or sold it outside Tyrebiter during the exclusive period (section 2). We’ll talk to you about relisting. A relisted vehicle is listed under this agreement, with a fresh PPSR search and listing check, and you can change the reserve before it goes live.',
  'Photos and listing content we create belong to Tyrebiter. We may keep showing the listing as a past result. You let us use any photos, videos and documents you give us to market and sell the vehicle and to show the result.']],
 ['s-cantcomplete','13. If you can’t complete a sale',[
  'If, after the vehicle has sold, you don’t hand it over, it turns out materially different from what you told us, or you sell it to someone else, we may cancel the sale and refund the buyer. You’ll then pay our seller fee (if any), the buyer’s premium and admin fee we lose, the buyer’s transfer costs they can’t recover, and our reasonable costs.',
  'This doesn’t apply if it happened because of something outside your control, for example the vehicle was stolen or destroyed through no fault of yours. Tell us straight away, and we’ll cancel the sale without charging you.']],
 ['s-gst','14. GST',[
  'If you’re GST-registered and selling a business asset, the sale price includes GST and the listing says so. You’re responsible for that GST. Tell us your ABN when you sign. [ACCOUNTANT TO CONFIRM agent invoicing arrangements]',
  'GST applies to our seller fee.']],
 ['s-privacy','15. Your information',[
  'We use your details to run the sale. We share your address with our inspection partner for mobile inspections and with the buyer for collection, and your name for the transfer papers. We check your ID and ownership papers, run PPSR searches, and keep your bank details securely to pay you. See our <a class="blue" href="/privacy">Privacy policy</a>.']],
 ['s-general','16. General',[
  'The Terms of Sale that apply to buyers form part of how we sell your vehicle. If this agreement and those terms conflict about you, this agreement applies.',
  'We may update this agreement for future listings. A change doesn’t apply to a vehicle already listed unless you agree to it in writing.',
  'Complaints: contact us first; we acknowledge within 1 business day and aim to resolve within 10 business days, with a review by a manager if you ask. You can also contact your state’s fair trading agency.',
  'We send notices by email, SMS or your seller dashboard, to the details you gave us. Neither of us is responsible for delays caused by events outside reasonable control (see the Terms of Sale, section 17).',
  'If part of this agreement can’t be enforced, it’s read down or left out and the rest still applies.',
  'This agreement is governed by the laws of [STATE], Australia. Version 10 October 2026.']]
];

export const HELP: [string, string, [string, string][]][] = [
   ['h-start','Getting started',[
    ['Is it free to join?','Yes. Registering, watching and bidding are free. You only pay fees on a vehicle you buy.'],
    ['What do I need to register?','An email, your legal name, date of birth, home address and an Australian mobile. Before you bid you verify your mobile with an SMS code, add a card, and verify your ID with a driver licence or passport and a selfie.'],
    ['Do I need an app to verify my ID?','No. It all happens in your browser. On a phone, your camera opens for a photo of your licence or passport and a selfie. On a computer, scan the QR code and finish on your phone.'],
    ['Why do you check my ID?','So every bidder (and every seller) is a real, identifiable person. It stops fake bids and protects sellers who let buyers onto their property.'],
    ['I forgot my password.','Tap Sign in, then “Forgot password?”. We’ll email you a reset link.']]],
   ['h-bid','Bidding',[
    ['How does auto-bid work?','Enter the most you’re willing to pay. We bid for you, one increment at a time, only as much as needed to keep you in front, up to your maximum. Nobody else sees your maximum.'],
    ['What are the bid increments?','INCREMENTS'],
    ['What happens in the final minutes?','Any bid in the last {{EXTEND}} minutes adds time so the auction ends {{EXTEND}} minutes after that bid. It only closes once {{EXTEND}} minutes pass with no bids, so everyone gets a fair go, even on a slow connection.'],
    ['Two people bid the same maximum. Who wins?','Whoever set that maximum first.'],
    ['Can I cancel a bid?','No. Every bid is binding, which is why we ask you to confirm the amount and show the all-in cost first.'],
    ['Will you tell me if I’m outbid?','We text and email you as fast as we can, but delivery isn’t guaranteed. Keep an eye on auctions you care about.'],
    ['What does “reserve not met” mean?','The seller has a minimum price bidding hasn’t reached yet. Your bid is still binding. If the auction ends below the reserve, the highest bid goes to the seller, who has {{REFERRAL_DAYS}} business days to accept or decline.'],
    ['What is Make an Offer?','If bidding ends below the reserve and the seller declines the highest bid (or doesn’t answer in time), offers open: you can offer an amount for the seller to consider. You can raise your offer while the offer period is open. An accepted offer is binding.'],
    ['What is Buy Now?','Some vehicles have a Buy Now price. Buy at that price and the auction ends immediately.'],
    ['Can I ask a question about a vehicle?','Yes. Use “Ask a question” on the listing. We check with the seller and reply, and we publish answers that help everyone.'],
    ['I think someone is bidding unfairly.','Use “Report a concern” on any listing. Sellers and their associates can’t bid on their own vehicles.'],
    ['What if the listing is corrected after I bid?','We tell you straight away, show the change on the listing, and make sure there are at least 24 hours of bidding left. If it changes your mind, call the consultant on the listing before bidding closes and we’ll cancel your bids.'],
    ['What are fleet sales?','A group of vehicles from one seller (a fleet, a council, a company) on one page. Each vehicle is its own auction and closes a few minutes after the one before, so you can follow each one.'],
    ['The winner didn’t pay. Can I still buy it?','Maybe. If the winning buyer doesn’t pay, we can offer the vehicle to the next highest bidder at their highest bid. We text and email you the offer, with the all-in price. There’s no obligation, and it’s only binding if you accept before it expires.']]],
   ['h-pay','Paying',[
    ['When is payment taken?','Straight away when you win. Under {{CARD_LIMIT}}, we charge your card in full. At {{CARD_LIMIT}} or more, we charge a deposit ({{NRD_LOW}}, or {{NRD_HIGH}} from {{NRD_SPLIT}}), which you lose only if you don’t pay, and you pay the balance by bank transfer within {{PAY_DAYS}} business days.'],
    ['What fees are added?','Buyer’s premium of {{PREMIUM}} plus GST, and an admin fee of {{ADMIN_FEE}}. No card surcharge. Every price on the site shows the all-in total beside it, and you see the all-in total again before you confirm a bid, offer or Buy Now.'],
    ['Do I get a tax invoice?','Yes. It’s emailed to you as a PDF when you win, and you can download it from your invoice page any time. Add your company name and ABN in your account if you’re buying for a business.'],
    ['What if my card is declined?','We text you a secure link to pay. You have 1 business day, then the sale may be cancelled.'],
    ['What if I don’t pay?','We can cancel the sale. A {{CANCEL_FEE}} cancellation fee applies to sales over {{CANCEL_ABOVE}}, or you lose your deposit, and your account may be suspended.'],
    ['Do I pay the seller?','Never. You only ever pay Tyrebiter. We never change our bank details by email, SMS or phone. If anyone asks you to pay differently, call us on {{PHONE}} first.'],
    ['Can I pay cash or by cheque?','No. Pay by card through Tyrebiter, or by bank transfer or PayID to the account on your invoice page. Allow up to a business day for a transfer to clear.'],
    ['Can someone else pay for me?','Tell us first. We may ask for proof and hold the release until we’re satisfied, to protect you and the seller from fraud.'],
    ['What if I pay late?','We remind you by SMS and email. Overdue balances may attract interest at {{LATE_INTEREST}} a year; there are no other late fees. If you still don’t pay, the sale can be cancelled (you lose your deposit) and your account suspended.']]],
   ['h-grade','Visual grades',[
    ['What is the visual grade?','A quick guide to how a vehicle looks, from our walkaround at the seller’s location. We grade paint and body, interior and tyres, plus an overall grade. We don’t grade mechanical condition, because a walkaround can’t test it.'],
    ['What does each grade mean?','GRADES'],
    ['Is the grade a guarantee?','No. It’s a guide, like the rest of the condition report. Order an independent mobile inspection if you want a mechanic’s opinion before you bid.']]],
   ['h-collect','Inspections and collection',[
    ['Where are the vehicles?','At the seller’s home or business. The listing shows the suburb. The full address goes to the buyer once they’ve paid, the vehicle is in their name and the collection time is confirmed.'],
    ['Is it registered?','Every listing says. Registered vehicles show the plate, state and expiry, and the registration is transferred to you before you collect. Unregistered vehicles are sold without plates: move them by carrier, trailer or permit.'],
    ['Can I see the vehicle before I bid?','Not in person. Order an independent mobile inspection from the listing: a mechanic inspects it where it is and emails you a report with photos. Or call the consultant shown on the listing to organise an inspection or ask a question.'],
    ['Can I test drive?','No. Test drives aren’t available. A mobile inspection includes a mechanic’s assessment, and some inspectors can include a road test where the vehicle is registered.'],
    ['What happens after I pay?','The vehicle goes into your name. Registered: the seller lodges their part, you transfer the registration online in the vehicle’s state and upload the confirmation from your invoice, and we check it (usually within a business day). Unregistered: confirm your certificate of sale and how you’ll move it. Then you book your collection.'],
    ['How do I collect?','Once the vehicle is in your name, book a time from your invoice. We confirm it with the seller and send you the address and a 6-digit release code. Collect within {{COLLECT_DAYS}} business days. Give the seller the code only when you’re with the vehicle and happy with it.'],
    ['Can someone else collect for me?','Yes. Name them when you book. They need photo ID matching that name, and we text them the release code. You’re responsible for them as if they were you.'],
    ['What should I bring to collect?','Photo ID, your release code, and what the vehicle needs to be moved safely: a driver licensed for it, or a trailer, tow truck or carrier. The seller doesn’t have to load it. Trucks and machinery must be moved by someone qualified, with insurance; tell us when you book.'],
    ['What if I can’t collect in time?','Ask us before the window ends. Otherwise storage of {{STORAGE}} a day applies.'],
    ['Can you deliver?','Use “Get a transport quote” on any listing or on your invoice. An independent carrier quotes to your postcode and, once you book, can send you a tracking link. Vehicles that don’t start can go on a tilt tray.'],
    ['What does “Starts and drives” mean?','It started and moved under its own power when we checked it at the listing walkaround. It isn’t a road test or a mechanical inspection. Other listings say “Starts, but doesn’t drive”, “Doesn’t start” or “Not tested”: allow for a carrier or trailer.']]],
   ['h-returns','Claims and returns',[
    ['Can I return a vehicle?','Not for change of mind. Vehicles are sold as is, where is, and auction purchases have no cooling-off period. Consider a mobile inspection before you bid.'],
    ['What are my consumer rights?','At auction (Tyrebiter sells as the seller’s agent) you get the guarantees of clear title, undisturbed possession and no undisclosed securities. The guarantees about quality don’t apply to auction sales. If you buy outright (Buy Now or an accepted offer) from a business seller, the consumer guarantees, including acceptable quality, may apply. Whichever way you buy, if the listing is wrong you can claim, and your rights against misleading descriptions aren’t affected. Each listing says whether the seller is private or a business.'],
    ['Does it come with a warranty?','Any remaining manufacturer’s warranty transfers with the vehicle. Statutory dealer warranties generally don’t apply to auction sales. You can arrange an extended warranty or roadside assistance from the partners on our Warranty page; you don’t need one to keep any consumer guarantee rights you have.'],
    ['What if it’s not as described?','If it’s materially different from the listing (wrong year, VIN or transmission, an undisclosed write-off or finance, major damage we didn’t show), lodge a claim from your invoice before handover or within {{CLAIM_DAYS}} business days after. If it’s upheld you can cancel for a full refund.'],
    ['How accurate is the condition report?','It’s a guide from a visual walkaround and what the seller declares in writing. It isn’t a mechanical or roadworthy inspection. The facts (VIN, rego, PPSR, odometer photo, transmission, fuel, listed features, warning lights, damage photos) are checked by us against the vehicle before it’s listed.']]],
   ['h-finance','Finance and insurance',[
    ['Can I get finance?','Yes, through a lender or broker. Use Car finance (in the menu) to work out repayments and compare the lenders we work with, then apply with them directly. Get pre-approved before you bid: bids are binding and payment is due when you win. Tyrebiter isn’t a lender or credit broker, and we may receive a fee from the lender.'],
    ['Do I need insurance before collecting?','The vehicle is in your name once the registration is transferred, and your responsibility from handover (or from the end of your collection window if you haven’t collected). Arrange cover from the day it goes into your name. Car insurance (in the menu) compares the insurers we work with. Tyrebiter isn’t an insurer and doesn’t give advice; read the PDS and TMD before you buy.'],
    ['Can I get a warranty or roadside assistance?','Yes, from the providers on our Warranty page. Compare what each covers, then ask for a quote. Tyrebiter doesn’t sell or recommend warranties, and may receive a commission. Read the PDS or terms before you buy.'],
    ['What happens to my details if I ask a partner to call?','We send the partner named on the form only the details you agree to share, and they contact you about that product. We record your consent. Ask us anytime and we’ll tell the partner to stop.']]],
   ['h-scams','Staying safe',[
    ['How do I know a message is really from Tyrebiter?','Our emails come from @tyrebiter.com.au and our texts from “Tyrebiter”. Links go to tyrebiter.com.au. We’ll never ask for your password or card number by email or SMS.'],
    ['Someone asked me to pay them directly.','Don’t. Only ever pay Tyrebiter, using the details on your invoice page. Report it to us on {{PHONE}}.'],
    ['I got an email saying your bank details changed.','That’s a scam. Our bank details never change by email. Call us before you pay anything.']]],
   ['h-sell','Selling',[
    ['How does selling work?','Type your plate on the Sell page and we fill in the vehicle; add the kilometres and anything we should know. We visit to photograph the vehicle and write the condition report, you sign your seller agreement online (verify your ID, answer a few questions, add your bank details), and we run a 7-day auction. Buyers don’t visit to view: we arrange any mobile inspections with you, take payment, and you hand over the keys when the buyer gives you their release code.'],
    ['What does it cost?','Seller fee: {{SELLER_FEE}}. No charge for photos, the condition report or the PPSR search.'],
    ['What if bidding doesn’t reach my reserve?','We send you the highest bid. Accept or decline it in your seller dashboard within {{REFERRAL_DAYS}} business days. If you decline, we open offers.'],
    ['When do I get paid?','Within {{PAYOUT_DAYS}} business days after the buyer collects and their {{CLAIM_DAYS}}-business-day claim window closes, less our fees. If there’s finance owing, we pay your lender first.'],
    ['Can I add a video?','Yes, one video per listing, up to 250 MB (a walkaround works best). Add it from your seller dashboard; our team checks it before it appears on the listing. A listing has up to 10 photos and videos in total.'],
    ['How do you fill in my vehicle’s details?','From vehicles we’ve listed before, and from the VIN: who made it, where and when, and what other vehicles we’ve listed with a similar VIN are. We don’t buy or copy rego records. Check what we fill in and correct anything that’s wrong.'],
    ['What do I do when it sells?','When the buyer has paid in full, lodge your part of the registration transfer. Your seller dashboard shows the steps for your state, and your consultant gives you the buyer’s details. Once ownership is transferred, we confirm the collection time with you.'],
    ['Can I see who’s bidding?','You can see every bid and its time in your seller dashboard. Bidders’ names are hidden to protect their privacy, and every bidder has verified their mobile, card and ID.'],
    ['Can I get a report of my vehicles?','Yes. Download it from your seller dashboard (a spreadsheet of every vehicle, its result and your payout). Fleets and businesses selling several vehicles can ask us to group them in one sale page.'],
    ['What if my vehicle doesn’t sell?','We’ll talk to you about relisting it (no extra seller fee), or about offering it to the next highest bidder if the buyer didn’t pay. Anyone who bid on or watched it last time hears when it’s back.'],
    ['Can I bid on my own vehicle?','No, and nor can anyone bidding for you. It breaks our agreement, and shill bidding can breach consumer law.']]],
  ];

export const PRIVACY: [string, string][] = [
   ['Who we are','{{LEGAL_NAME}} (ABN {{ABN}}). We handle personal information under the Privacy Act 1988 and the Australian Privacy Principles.'],
   ['What we collect','Buyers: name, date of birth, address, email, mobile, company and ABN if given, the result of your ID check, card tokens from our payment provider, bids, offers, purchases, questions and how you use the site. Sellers: the same identity details, plus vehicle ownership papers, answers about the vehicle, finance and lender details, and bank details for your payout.'],
   ['How you use the site','To run and improve Tyrebiter we count the pages and app screens viewed, searches (the filters used, such as make, model, price and state, and how many vehicles matched; never the words you type), the type of device, the website or campaign link that brought you, and your approximate state (from your internet connection’s location). We count visits with an anonymous code that changes every day, so we can’t follow a person from one day to the next. We don’t use advertising cookies or sell this information. Browsers that send Do Not Track or Global Privacy Control aren’t counted. Detailed records are deleted after 90 days; only daily totals are kept. When you join, we note where your first visit came from (for example Google or a newsletter link).'],
   ['Why we collect it','To run auctions, verify identity, check ownership and PPSR status, take and make payments, arrange mobile inspections and collection, prevent fraud and shill bidding, send the alerts you choose, and meet our legal obligations (including record keeping).'],
   ['Who we share it with','Sellers get the buyer’s (and collector’s) name for collection and transfer papers. The buyer, and the inspector for a mobile inspection, get the seller’s address. If you ask a finance, insurance, inspection, transport or warranty partner to contact you, we share the details you agree to with that partner (they’re named on the form), and they may pay us a fee. We also share with our identity-verification provider (Stripe Identity), payment provider (Stripe), SMS and email providers (Twilio, Resend), hosting providers (Vercel, Supabase), your lender for a payout, transport providers you book, and authorities where the law requires. Some providers store data outside Australia.'],
   ['Card, bank and ID details','Card numbers are held by Stripe, never by Tyrebiter. ID documents are checked by Stripe Identity; we keep the result, not a copy of your document. Seller bank details and ownership papers are stored securely and seen only by our team.'],
   ['How long we keep it','For as long as your account is open, and afterwards for as long as the law requires for sale and tax records (generally 7 years).'],
   ['Access, correction and deletion','See and update your details in your account, or ask us for a copy of what we hold. You can delete your account yourself, in the app or on the website (Account, then Delete my account), once nothing is in progress (live bids, a purchase not yet paid for and collected, or a vehicle for sale). We then delete your personal details and keep only the sale and tax records the law requires.'],
   ['Our apps','If you allow notifications, we store your phone’s push token, its platform and the app version, so we can send the alerts you choose (you can turn each kind off in the app). The app uses your camera, photos or videos only when you choose to add them to a claim, an appraisal or your listing. We don’t use advertising identifiers, track you across other apps or websites, or collect your location.'],
   ['Marketing','We only send marketing (such as our weekly email of new vehicles) if you opt in, under Alerts in your account. Every marketing email and optional alert has a one-click unsubscribe link and our contact details, and we act on an unsubscribe straight away.'],
   ['Complaints','Contact our privacy officer at [privacy@tyrebiter.com.au]. If you’re not satisfied, you can contact the Office of the Australian Information Commissioner (OAIC).']
  ];

// Using the website and app (as opposed to buying a vehicle, which the Terms of Sale cover).
// Written to avoid the terms the unfair contract terms laws catch: no termination "for any reason",
// no one-sided changes without notice, no blanket exclusions, and reasons given for suspension.
export const WEBSITE_TERMS_VERSION_LABEL = "Version 10 October 2026";

export const WEBSITE_TERMS: [string, string, string[]][] = [
 ['w-about','1. About these terms',[
  'These terms cover using tyrebiter.com.au and the Tyrebiter app. They’re between you and {{LEGAL_NAME}} (ABN {{ABN}}) (“Tyrebiter”, “we”).',
  'Buying a vehicle is covered by our <a class="blue" href="/terms">Terms of sale</a>, and selling one by the <a class="blue" href="/seller-agreement">Seller agency agreement</a>. If these terms and those conflict about a sale, those apply.',
  'Nothing in these terms excludes, restricts or changes any right you have under the Australian Consumer Law that can’t lawfully be excluded.']],
 ['w-account','2. Your account',[
  'You must be 18 or over to create an account. One account per person: you can add your business details to it, but don’t open a second account or let someone else use yours.',
  'Give us true, current details and keep them up to date. We verify mobiles, cards and IDs before you bid or sell, and we may ask for more if something doesn’t match.',
  'Keep your password and sign-in codes private. Tell us straight away on {{PHONE}} if you think someone else has used your account. You’re responsible for what happens on your account until you tell us, unless it happened because of a failure in our security.']],
 ['w-use','3. Using the website and app fairly',[
  'Don’t: copy or scrape listings, photos or prices with software, bots or scripts (personal use, like sharing a listing link, is fine); bid with automated tools or for anyone else without telling us; interfere with an auction, the website or other people’s accounts; give false information or pretend to be someone else; or upload anything unlawful, offensive or that isn’t yours to share.',
  'Don’t use details you get through Tyrebiter (such as a seller’s address or a buyer’s name) for anything other than the sale they were given for, and don’t arrange to buy or sell a vehicle listed with us outside Tyrebiter to avoid our fees.',
  'Questions, reports and anything else you send us must be honest and about the vehicle or the sale. We may decline to publish a question, or edit it to remove personal details.']],
 ['w-content','4. Content and intellectual property',[
  'The website, the app and the listings we create, including our photos, condition reports and descriptions, belong to Tyrebiter or the people who licensed them to us (photo credits are shown). You can view and share them for personal use, but you can’t copy them to another website or listing.',
  'If you send us photos, videos, documents or questions, you keep ownership of them, and you let us use them to run, show and promote the sale they relate to, and to show past results.']],
 ['w-info','5. Information on the website',[
  'We check the facts in each listing against the vehicle before it goes live (see <a class="blue" href="/listing-promise">How we check listings</a>). Condition reports, grades, price guides, estimates and repayment calculators are a guide only, and the Terms of sale say what you can do if a listing is wrong.',
  'Finance, insurance, inspection, transport and warranty providers shown on Tyrebiter are independent businesses. Their products have their own terms, and they’re responsible for them. We don’t recommend a provider or give financial advice, and we may receive a fee if you deal with one (shown on each page).']],
 ['w-availability','6. Availability and changes to the service',[
  'We work to keep Tyrebiter running, but we can’t promise it will always be available or free of errors. We may pause it for maintenance, preferably outside busy times. If an outage affects the end of an auction, the Terms of sale (section 17) explain what we do.',
  'Alerts by SMS, email and app notification are sent as quickly as we can, but they can be delayed or not arrive. Don’t rely on them alone for auctions that matter to you.']],
 ['w-suspend','7. Suspending or closing an account',[
  'You can close your account at any time, in your account settings or the app, once nothing is in progress (a live bid, an unpaid or uncollected purchase, or a vehicle for sale).',
  'We may suspend or close your account, or limit what you can do (for example stop you bidding), only if: you seriously or repeatedly break these terms or the Terms of sale; you don’t pay for a vehicle you won; we reasonably suspect fraud, identity misuse or shill bidding; it’s reasonably needed to protect other members, sellers or the security of Tyrebiter; or the law requires it.',
  'We’ll tell you why, unless the law or a police request stops us, and you can ask us to review the decision through our complaints process. Closing an account doesn’t cancel a sale already made, or anything you or we already owe.']],
 ['w-liability','8. Liability',[
  'We’re responsible for loss caused by our own negligence, fraud or breach of these terms. We aren’t responsible for indirect loss that wasn’t reasonably foreseeable, for loss caused by your own device, connection or security, or for events outside our reasonable control.',
  'You’ll pay us back for loss we reasonably suffer because you broke section 3, except to the extent we caused it.',
  'Where the law lets us limit our liability for a service, it’s limited to supplying the service again or paying the cost of having it supplied again.']],
 ['w-privacy','9. Privacy and messages',[
  'We handle your personal information under our <a class="blue" href="/privacy">Privacy policy</a>. We send the account and sale messages you need, and marketing only if you opt in. Every marketing message has a one-click unsubscribe.']],
 ['w-general','10. Changes, complaints and the law',[
  'We may update these terms. We’ll give you at least 14 days’ notice of a change that’s not in your favour, by email or in the app, and you can close your account before it starts if you don’t accept it. A change never applies to a sale already made.',
  'Complaints: contact us on {{PHONE}} or {{EMAIL}}. We acknowledge within 1 business day and aim to resolve within 10 business days, with a review by a manager if you ask. You can also contact your state’s fair trading or consumer affairs agency.',
  'These terms are governed by the laws of [STATE], Australia, and nothing here stops you using a tribunal or court in your own state where the law allows. If part of them can’t be enforced, it’s read down or left out and the rest still applies.',
  'This version: 10 October 2026.']]
];

// ---------------------------------------------------------------------------
// Fills {{TOKENS}} with the live fees and settings.
// ---------------------------------------------------------------------------
type Settings = Record<string, Record<string, unknown> | undefined>;
const aud = (n: unknown) => `$${Number(n || 0).toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;

export function legalValues(s: Settings): Record<string, string> {
  const f = { premium_rate: 0.1, admin_fee: 99, card_limit: 5000, nrd_low: 500, nrd_high: 1000, nrd_split: 20000, cancel_fee: 250, cancel_above: 1000,
    storage_per_day: 50, seller_fee_rate: 0, seller_fee_min: 0, withdrawal_fee: 250, late_interest_rate: 10, ...(s.fees || {}) } as Record<string, number>;
  const a = { extend_minutes: 10, referral_days: 2, offer_days: 2, payment_days: 2, collection_days: 5, claim_days: 2, abandon_days: 10, payout_days: 3, exclusivity_days: 30, ...(s.auction || {}) } as Record<string, number>;
  const rate = Number(f.seller_fee_rate) || 0, min = Number(f.seller_fee_min) || 0;
  const sellerFee = rate === 0 && min === 0 ? "none. Selling with Tyrebiter is free for sellers; buyers pay our fees"
    : `${Math.round(rate * 1000) / 10}% of the sale price${min ? ` (minimum ${aud(min)})` : ""}, plus GST`;
  return {
    PREMIUM: `${Math.round(Number(f.premium_rate) * 1000) / 10}%`, ADMIN_FEE: aud(f.admin_fee), CARD_LIMIT: aud(f.card_limit),
    NRD_LOW: aud(f.nrd_low), NRD_HIGH: aud(f.nrd_high), NRD_SPLIT: aud(f.nrd_split), CANCEL_FEE: aud(f.cancel_fee), CANCEL_ABOVE: aud(f.cancel_above),
    STORAGE: aud(f.storage_per_day), SELLER_FEE: sellerFee, WITHDRAWAL_FEE: aud(f.withdrawal_fee),
    EXTEND: String(a.extend_minutes), REFERRAL_DAYS: String(a.referral_days), OFFER_DAYS: String(a.offer_days), PAY_DAYS: String(a.payment_days),
    COLLECT_DAYS: String(a.collection_days), CLAIM_DAYS: String(a.claim_days), ABANDON_DAYS: String(a.abandon_days), PAYOUT_DAYS: String(a.payout_days),
    EXCLUSIVITY_DAYS: String(a.exclusivity_days),
    LEGAL_NAME: process.env.NEXT_PUBLIC_LEGAL_NAME || "Tyrebiter Pty Ltd", ABN: process.env.NEXT_PUBLIC_ABN || "[ABN]",
    PHONE: process.env.NEXT_PUBLIC_SUPPORT_PHONE || "[1300 XXX XXX]", EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "help@tyrebiter.com.au",
    LICENCES: licenceText(s),
    LATE_INTEREST: Number(f.late_interest_rate) > 0 ? `${Math.round(Number(f.late_interest_rate) * 100) / 100}%` : "0%",
  };
}

function licenceText(s: Settings) {
  const lic = Object.entries(((s.business || {}).licences || {}) as Record<string, string>).filter(([, v]) => v);
  return lic.length ? lic.map(([st, v]) => `${st}: ${v}`).join("; ") : "[LICENCE DETAILS BY STATE]";
}

export function fillLegal<T>(content: T, settings: Settings): T {
  const v = legalValues(settings);
  return JSON.parse(JSON.stringify(content).replace(/\{\{(\w+)\}\}/g, (m, k) => (v[k] ?? m).replace(/"/g, '\\"')));
}
