// Legal and help copy, in plain English. DRAFT: have an Australian lawyer review before launch
// (licensing in each state, ACL wording, unfair contract terms, state registration rules).
// {{TOKENS}} are filled from Admin → Fees & settings by fillLegal(), so the pages always match the fees charged.

export const TERMS_VERSION_LABEL = "Version 1 October 2026";

export const TERMS: [string, string, string[]][] = [
 ['t-summary','The short version',[
  'Tyrebiter sells vehicles on behalf of their owners. We act as the seller’s agent. The contract of sale is between you and the seller, and we run the sale and collect the money.',
  'Every vehicle stays at the seller’s location. You inspect it there, by appointment, and collect it from there.',
  'Vehicles are sold <b>as is, where is</b>, with <b>no warranty</b> about condition. Condition reports and grades are a guide only. But the facts in a listing (make, model, year, VIN, transmission, fuel, write-off status, finance) must be right, and if they’re materially wrong you can claim (section 12).',
  'Registering and bidding are free. To bid you need a verified mobile, a card on file and a verified ID.',
  'Bids are binding and can’t be withdrawn. If you win, payment is taken straight away: under {{CARD_LIMIT}} in full from your card; {{CARD_LIMIT}} or more, a non-refundable deposit by card and the balance by bank transfer within {{PAY_DAYS}} business days.',
  'Fees: buyer’s premium of {{PREMIUM}} plus GST and an admin fee of {{ADMIN_FEE}}. No card surcharge.',
  'You get clear title: any finance owing is paid out of the sale before the seller is paid. Risk stays with the seller until you collect.',
  'There is no cooling-off period.']],
 ['t-agent','1. Who you are dealing with',[
  '{{LEGAL_NAME}} (ABN {{ABN}}) (“Tyrebiter”, “we”) runs online auctions for vehicles owned by private sellers and businesses. We act as the seller’s agent under a written agency agreement. We don’t own the vehicles we list.',
  'When your bid wins, or the seller accepts your offer or your Buy Now, a binding contract of sale is formed between you and the seller on these terms. We collect payment from you for the seller and hold it until the sale completes.',
  'We hold a motor dealer and/or auctioneer licence where the law in each state requires one: [LICENCE DETAILS BY STATE].']],
 ['t-location','2. Where vehicles are',[
  'Every vehicle is at the seller’s home or business, not a Tyrebiter yard. The listing shows the suburb and state.',
  'We give the full address to ID-verified bidders when we confirm an inspection, and to the buyer when we confirm a collection time. Don’t visit a seller without a confirmed booking, and don’t contact a seller to deal outside Tyrebiter.']],
 ['t-condition','3. Listings and condition reports',[
  'Each listing has two kinds of information. <b>Facts we check</b>: make, model, build year, VIN, registration, and the PPSR search (finance, written-off and stolen status). <b>Condition information</b>: our visual walkaround, visual grades (A to E), photos, flaw photos, and what the seller declared in writing (accidents, flood or hail, modifications, warning lights, known faults, service history, keys).',
  'Our condition reports come from a visual walkaround at the seller’s location. They are not mechanical, structural, electrical or roadworthy inspections, and they may not show every fault. Faults may exist that neither we nor the seller know about.',
  'Visual grades describe how the vehicle looks. They don’t assess mechanical condition. Grade definitions are in the Help centre.',
  'Odometer readings are as displayed on the vehicle and are not independently verified. The seller has declared in writing whether they know of any reason the reading may be inaccurate.',
  '“Year” means the build year unless the listing says it’s the compliance date. Keys, service books, manuals and accessories are included only if the listing says so. Any remaining manufacturer’s warranty is between you and the manufacturer. Reports supplied by the seller (for example an old roadworthy or a mechanic’s report) are passed on as the seller gave them and aren’t checked or warranted by us.',
  'Used vehicles, especially older and commercial ones, often need repairs. Satisfy yourself before you bid, by inspecting in person or arranging an independent inspection.']],
 ['t-asis','4. As is, where is, and your consumer rights',[
  'Every vehicle is sold as is, where is: in its condition and location at the end of the auction, with all faults, whether or not they’re described. Neither Tyrebiter nor the seller warrants the vehicle’s mechanical condition, fitness for purpose, roadworthiness or history beyond the facts in section 3 and the seller’s written declarations.',
  'Nothing in these terms excludes, restricts or changes any right you have under the Australian Consumer Law that can’t lawfully be excluded, including the guarantees of title and undisturbed possession. Some consumer guarantees (such as acceptable quality) don’t apply to goods sold by auction where the auctioneer acts as the seller’s agent. Where a sale is made by Buy Now or an accepted offer, or the seller is a business, some guarantees may still apply. [LAWYER TO CONFIRM FOR EACH SALE PATH AND SELLER TYPE]',
  'No cooling-off period applies to auction purchases.']],
 ['t-inspect','5. Inspections',[
  'ID-verified members can book an inspection through Tyrebiter. Inspections happen at the seller’s location at a time we confirm.',
  'Show your driver licence to the seller before you’re given the keys. You may look over the vehicle and start the engine. Don’t rev it hard. Test drives on public roads aren’t allowed unless the seller agrees in writing and the vehicle is registered and insured.',
  'Follow the seller’s reasonable safety directions. You are responsible for damage you cause. We may cancel your account for inappropriate behaviour at a seller’s property. [LAWYER: occupier liability and our public liability cover]']],
 ['t-bidding','6. Registering and bidding',[
  'You must be 18 or over and give your legal name, date of birth, residential address and an Australian mobile. Business buyers can add their company name and ABN for their tax invoice.',
  'Before your first bid or inspection you verify your mobile with an SMS code, add a card, and verify your identity with a driver licence or passport and a selfie, through Stripe Identity. Your name and date of birth must match your ID.',
  'One account per person. Don’t bid for someone else unless we’ve approved it in writing. Don’t use more than one account, collude with other bidders, or bid to inflate a price.',
  'Every bid is a binding offer to buy at that amount plus the buyer’s premium and fees. Bids can’t be withdrawn. We ask you to confirm each bid and show the all-in cost before it’s placed.',
  'If you set a maximum, we bid for you one increment at a time, only as far as needed to keep you in front, up to your maximum. Nobody else sees your maximum. If two bidders set the same maximum, the one who set it first wins.',
  'Going, going, gone: any bid in the last {{EXTEND}} minutes extends the auction to {{EXTEND}} minutes after that bid. It closes once {{EXTEND}} minutes pass with no new bid.',
  'Our alerts (outbid, ending soon) are sent as fast as we can, but delivery isn’t guaranteed. Keep an eye on auctions you care about.',
  'Reserve: if the auction ends below the seller’s reserve, the highest bid is referred to the seller, who has {{REFERRAL_DAYS}} business days to accept. Your bid stays binding until they decide. If they accept, it’s a win. If they decline or don’t answer in time, offers open.',
  'Make an Offer: during the offer period ({{OFFER_DAYS}} business days) you can offer an amount. It stays binding until the seller declines it, you replace it with a higher offer, or the period ends. If the seller accepts, it’s a win.',
  'Buy Now: where shown, you can buy at the Buy Now price until bidding reaches it. The auction ends immediately and payment is taken as for a win. The buyer’s premium and admin fee apply to Buy Now purchases.',
  'Sellers, their associates and anyone using the seller’s mobile can’t bid on the seller’s vehicle. We monitor bidding and may cancel bids, void sales and close accounts for shill bidding or collusion.',
  'If there’s a technical fault or an obvious error in a listing, we may extend, pause, cancel or reopen an auction, and we’ll tell affected bidders.']],
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
  'Total of {{CARD_LIMIT}} or more: a non-refundable deposit of {{NRD_LOW}} (or {{NRD_HIGH}} if the total is {{NRD_SPLIT}} or more) is charged to your card straight away. Pay the balance by bank transfer (or PayID if shown) within {{PAY_DAYS}} business days, quoting your invoice number.',
  'If a card charge is declined, we’ll text you a secure link. Pay within 1 business day or we may cancel the sale under section 11.',
  'You receive a tax invoice by email when you win, and a receipt when you’ve paid in full.',
  'Pay Tyrebiter only, never the seller. We will never change our bank details by email, SMS or phone. If anyone asks you to, don’t pay: call us on {{PHONE}}.']],
 ['t-title','9. Title, risk and collection',[
  'Title: we search the PPSR before listing. Any registered finance is paid out of the sale price before the seller is paid, so you receive the vehicle free of registered security interests once you’ve paid in full. If a title problem appears that we can’t fix, we’ll cancel the sale and refund everything you paid.',
  'Ownership passes to you when we receive full payment in cleared funds.',
  'Risk passes to you at handover, or at the end of your collection window if you haven’t collected, whichever comes first. Until then the seller must keep the vehicle insured and in the same condition. If it’s damaged, stolen or materially changed before handover, you may cancel for a full refund.',
  'Collection: after paying in full, book a time from your invoice. We confirm it with the seller and send you the address and a 6-digit release code. Collect within {{COLLECT_DAYS}} business days of paying in full (we can agree more time for interstate buyers and transport companies if you ask before the window ends).',
  'Whoever collects must be named on your booking and show photo ID matching that name. A transport company must quote your booking reference. The seller only hands over the vehicle when given the release code.',
  'Check the vehicle against the listing before you accept the keys. Handover starts the claim window in section 12.',
  'Storage: if you don’t collect within the window, storage of {{STORAGE}} per day applies from the next day and must be paid before release. It’s passed to the seller for keeping the vehicle.',
  'Abandonment: if you still haven’t collected {{ABANDON_DAYS}} business days after we give you written notice, we may cancel the sale, resell the vehicle and refund what you paid less the premium, fees, storage, resale costs and any shortfall. [LAWYER: state uncollected goods laws]']],
 ['t-states','10. Registration, transfer and roadworthy (rules differ by state)',[
  'You pay transfer fees, stamp duty, registration and plate fees, and any late-transfer penalties, and you must transfer the registration within the time your state requires. The seller signs the transfer papers and lodges their notice of disposal.',
  'Roadworthy and safety certificates: vehicles are sold without one unless the listing says otherwise. In some states a certificate is needed to transfer registration (for example Victoria), and in Queensland a safety certificate is generally needed to offer a registered light vehicle for sale unless an exemption applies. Where the seller’s state requires one for the sale, the listing says whether it’s provided. Otherwise getting one is your responsibility. [LAWYER TO CONFIRM EACH STATE AND TERRITORY]',
  'Interstate buyers: registration usually transfers only to someone in the same state. If you’re interstate, the seller may remove their plates (and in some states must), and you’ll need to register the vehicle in your state, which may need an inspection. Ask your state’s transport authority about an unregistered vehicle permit to move it.',
  'Remaining registration isn’t refunded or adjusted between buyer and seller.',
  'Written-off vehicles: if a vehicle is on a written-off vehicle register, the listing says so. Statutory write-offs can never be re-registered. Check whether a repairable write-off can be registered in your state before you bid.']],
 ['t-default','11. If a buyer doesn’t pay or collect',[
  'If you don’t pay on time, we may cancel the sale, offer the vehicle to the next highest bidder or relist it, and suspend your account.',
  'If we cancel because you didn’t pay, a cancellation fee of {{CANCEL_FEE}} applies to sales over {{CANCEL_ABOVE}}, which we may charge to your card. Where you paid a deposit, we keep the deposit instead. These amounts are our genuine estimate of the costs of a failed sale (relisting, the seller’s lost time, payment costs).',
  'You may also be liable for the difference if the vehicle resells for less, plus reasonable resale costs.']],
 ['t-claims','12. If the vehicle isn’t as described (claims)',[
  'You can make a claim if the vehicle is <b>materially different</b> from its listing in a way an ordinary look at the photos and report wouldn’t have told you, for example: a different make, model, build year or VIN; manual listed as automatic (or the reverse); a different fuel type; an undisclosed written-off or stolen status; undisclosed finance; an odometer materially different from the listing; a key feature listed that isn’t there; or major damage the listing didn’t show or mention.',
  'Claims don’t cover general wear, mechanical faults a walkaround couldn’t reveal, or anything disclosed in the listing or the seller’s declarations.',
  'How: lodge the claim from your invoice, with photos, before you accept handover, or within {{CLAIM_DAYS}} business days after handover. Don’t modify, register, repair or use the vehicle (beyond getting it home) while we review it.',
  'We compare the vehicle with the listing as it was at the moment of sale (we keep a copy), speak to the seller, and give you a decision within 2 business days of receiving what we need. If your claim is upheld, you can cancel the sale for a full refund of everything you paid, or agree a price adjustment. The seller’s payout is held while a claim is open.']],
 ['t-liability','13. Our liability',[
  'To the extent the law allows, Tyrebiter isn’t liable for loss arising from a vehicle’s condition (other than under section 12), from inspections, or from website outages or errors outside our reasonable control.',
  'Where our liability can’t be excluded but can be limited, it’s limited to (at our option) supplying the service again or refunding the buyer’s premium and admin fee you paid. This doesn’t limit your rights under section 12 or under the Australian Consumer Law.']],
 ['t-privacy','14. Privacy',[
  'We collect your details to run auctions, verify identity, process sales and prevent fraud. We share only what’s needed: your name (and your collector’s) with the seller for collection and the transfer papers. See our <a class="blue" href="/privacy">Privacy policy</a>.']],
 ['t-complaints','15. Complaints',[
  'Contact us first on {{PHONE}} or {{EMAIL}}. We acknowledge complaints within 1 business day and aim to resolve them within 10 business days.',
  'If you’re not satisfied, you can contact the fair trading or consumer affairs agency in your state or territory.']],
 ['t-general','16. General',[
  'These terms are governed by the laws of [STATE], Australia. We may update them. The version you accepted when you placed a bid, offer or Buy Now applies to that sale, and we’ll ask you to accept any new version before your next bid.',
  'This version: 1 October 2026.']]
];

export const SELLER_AGREEMENT: [string, string, string[]][] = [
 ['s-parties','1. This agreement',[
  'This Seller Agency Agreement is between you (the “seller”) and {{LEGAL_NAME}} (ABN {{ABN}}) (“Tyrebiter”). It applies to the vehicle named in your listing link. You sign it electronically, and we record the date, time and device.',
  'You appoint Tyrebiter as your exclusive agent to sell the vehicle by online auction from your location, and during any referral and offer period that follows.']],
 ['s-exclusive','2. Exclusive period',[
  'While the vehicle is listed, and for {{EXCLUSIVITY_DAYS}} days after the listing ends, you agree not to sell it to anyone introduced through Tyrebiter (for example someone who inspected it or bid on it) except through us. If you do, our seller fee is payable as if we’d sold it at the higher of the highest bid and your reserve, plus the buyer’s premium we would have earned.']],
 ['s-fees','3. Fees',[
  'Seller fee: {{SELLER_FEE}}. It’s earned only when the vehicle sells, and it’s taken from the sale proceeds.',
  'There’s no charge for the appraisal, photos, condition report or PPSR search, unless we agree otherwise in writing.',
  'Buyers pay us a buyer’s premium and admin fee. Those are ours and don’t reduce your proceeds.']],
 ['s-reserve','4. Reserve and your decisions',[
  'You set the reserve when you sign. It stays secret from bidders. You may lower it at any time, but you can’t raise it once bidding has started.',
  'You authorise us to accept any bid at or above the reserve on your behalf. If there’s no reserve, the vehicle sells to the highest bidder.',
  'If bidding ends below the reserve, we send you the highest bid. You have {{REFERRAL_DAYS}} business days to accept or decline in your seller dashboard. If you don’t respond in time, it counts as a decline and we open offers for {{OFFER_DAYS}} business days. Accepting a referred bid or an offer in your dashboard is binding.']],
 ['s-nobid','5. No seller bidding',[
  'You, your family, employees and associates must not bid on the vehicle or ask anyone to bid for you. If that happens, we may void the sale and cancel the listing, and our seller fee plus the buyer’s premium is payable on the higher of the highest bid and your reserve, plus our reasonable costs.']],
 ['s-warranties','6. What you promise us (and buyers rely on)',[
  'You are the owner of the vehicle, or you are authorised in writing by every owner (or by the company or trust that owns it) to sell it.',
  'The vehicle is free of security interests and charges, except finance you’ve told us about. You authorise us to pay that finance out from the sale proceeds and to deal with your lender to do so.',
  'The vehicle isn’t stolen, and isn’t written off unless you’ve told us. The VIN and engine number are genuine and haven’t been altered.',
  'You don’t know of any tampering with the odometer, other than anything you’ve told us.',
  'Your answers to our questions (accidents, flood or hail damage, modifications, warning lights, known faults, keys and service books) are true and complete as far as you know, and you’ve told us about every fault you know of.',
  'Tolls, fines and registration charges up to handover are yours.',
  'You must tell us straight away if anything you’ve told us stops being true.']],
 ['s-obligations','7. Looking after the vehicle until handover',[
  'Keep the vehicle at the listed address, insured, and in the same condition as when it was photographed. Only use it as needed (keep the odometer within 100 km of the listing).',
  'Give ID-verified buyers access for inspections we confirm, and give the buyer access to collect at the time we confirm. Keep the battery charged and some fuel in the tank.',
  'The vehicle stays at your risk until handover. If it’s damaged, stolen or changes materially before handover, tell us immediately. The buyer may then cancel.',
  'At handover: check the collector’s photo ID matches the name we give you, and only hand over the vehicle when they give you the release code, which you enter on your handover page. Hand over every key, book and accessory in the listing. Remove any toll tag and personal data. Never accept money from the buyer directly.',
  'After handover: sign the transfer papers, remove your plates if your state requires it, and lodge your notice of disposal.']],
 ['s-withdraw','8. Withdrawing the vehicle',[
  'You can withdraw the vehicle free of charge before the auction goes live.',
  'After it goes live, you can only withdraw with our agreement, and a withdrawal fee of {{WITHDRAWAL_FEE}} applies to cover the costs of photography, the report, the PPSR search and marketing. [LAWYER: unfair contract terms review] Once a bid at or above the reserve has been made, the vehicle can’t be withdrawn.']],
 ['s-default','9. If the buyer doesn’t pay',[
  'If the buyer doesn’t pay, we may offer the vehicle to the next highest bidder (with your agreement if it’s below your reserve) or relist it without a new seller fee.',
  'If we keep a deposit or cancellation fee from a buyer who didn’t pay, we pay you half of it after our costs. You authorise us to deal with the buyer; you can’t pursue them directly unless we agree.']],
 ['s-settlement','10. Getting paid',[
  'The buyer pays Tyrebiter. We pay you the sale price less our seller fee (plus GST on it), any finance we pay out to your lender, and any other costs you’ve agreed to in writing.',
  'We pay you within {{PAYOUT_DAYS}} business days after both (a) the buyer has collected, and (b) the buyer’s claim window ({{CLAIM_DAYS}} business days after handover) has closed with no open claim. You get a settlement statement.',
  'We pay only into the bank account you gave us when you signed, which we confirm with you by phone. We’ll never ask you to change it by email.',
  'If the finance owing is more than the sale price, you must pay your lender the difference before we can complete the sale.',
  'Sale money is held for you in [TRUST / SEPARATE ACCOUNT - LAWYER TO CONFIRM] until it’s paid out.']],
 ['s-claims','11. Buyer claims and clawback',[
  'If a buyer claims the vehicle is materially different from the listing (see the Terms of Sale, section 12), we hold your payout while we review it, using the listing as it was at the moment of sale and your written answers.',
  'If the claim is upheld because of something you told us (or didn’t tell us), you agree that the sale may be cancelled and the buyer refunded, that you’ll take the vehicle back, and that you’ll repay any money already paid to you and our reasonable costs. You indemnify Tyrebiter against claims, losses and costs caused by a breach of your promises in section 6.']],
 ['s-unsold','12. If it doesn’t sell',[
  'Nothing is payable if the vehicle doesn’t sell, unless you withdrew it (section 8) or sold it outside Tyrebiter during the exclusive period (section 2). We’ll talk to you about relisting.',
  'Photos and listing content we create belong to Tyrebiter. We may keep showing the listing as a past result.']],
 ['s-gst','13. GST',[
  'If you’re GST-registered and selling a business asset, the sale price includes GST and the listing says so. You’re responsible for that GST. Tell us your ABN when you sign. [ACCOUNTANT TO CONFIRM agent invoicing arrangements]',
  'GST applies to our seller fee.']],
 ['s-privacy','14. Your information',[
  'We use your details to run the sale. We share your address with ID-verified buyers who book an inspection and with the buyer for collection, and your name for the transfer papers. We check your ID and ownership papers, run PPSR searches, and keep your bank details securely to pay you. See our <a class="blue" href="/privacy">Privacy policy</a>.']],
 ['s-general','15. General',[
  'The Terms of Sale that apply to buyers form part of how we sell your vehicle. If this agreement and those terms conflict about you, this agreement applies.',
  'This agreement is governed by the laws of [STATE], Australia. Version 1 October 2026.']]
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
    ['What is Make an Offer?','If an auction ends below the reserve, you can offer an amount for the seller to consider. You can raise your offer while the offer period is open. An accepted offer is binding.'],
    ['What is Buy Now?','Some vehicles have a Buy Now price. Buy at that price and the auction ends immediately.'],
    ['Can I ask a question about a vehicle?','Yes. Use “Ask a question” on the listing. We check with the seller and reply, and we publish answers that help everyone.'],
    ['I think someone is bidding unfairly.','Use “Report a concern” on any listing. Sellers and their associates can’t bid on their own vehicles.']]],
   ['h-pay','Paying',[
    ['When is payment taken?','Straight away when you win. Under {{CARD_LIMIT}}, we charge your card in full. At {{CARD_LIMIT}} or more, we charge a non-refundable deposit ({{NRD_LOW}}, or {{NRD_HIGH}} from {{NRD_SPLIT}}) and you pay the balance by bank transfer within {{PAY_DAYS}} business days.'],
    ['What fees are added?','Buyer’s premium of {{PREMIUM}} plus GST, and an admin fee of {{ADMIN_FEE}}. No card surcharge. The all-in total is shown before you confirm a bid.'],
    ['Do I get a tax invoice?','Yes. It’s emailed to you as a PDF when you win, and you can download it from your invoice page any time. Add your company name and ABN in your account if you’re buying for a business.'],
    ['What if my card is declined?','We text you a secure link to pay. You have 1 business day, then the sale may be cancelled.'],
    ['What if I don’t pay?','We can cancel the sale. A {{CANCEL_FEE}} cancellation fee applies to sales over {{CANCEL_ABOVE}}, or you lose your deposit, and your account may be suspended.'],
    ['Do I pay the seller?','Never. You only ever pay Tyrebiter. We never change our bank details by email, SMS or phone. If anyone asks you to pay differently, call us on {{PHONE}} first.']]],
   ['h-grade','Visual grades',[
    ['What is the visual grade?','A quick guide to how a vehicle looks, from our walkaround at the seller’s location. We grade paint and body, interior and tyres, plus an overall grade. We don’t grade mechanical condition, because a walkaround can’t test it.'],
    ['What does each grade mean?','GRADES'],
    ['Is the grade a guarantee?','No. It’s a guide, like the rest of the condition report. Inspect the vehicle, or arrange an independent inspection, before you bid.']]],
   ['h-collect','Inspecting and collecting',[
    ['Where are the vehicles?','At the seller’s home or business. The listing shows the suburb. Verified bidders can book an inspection, and we share the address when it’s confirmed.'],
    ['Can I test drive?','You can look it over and start it with the seller’s permission (show your licence first). Test drives on public roads need the seller’s written agreement and a registered vehicle.'],
    ['How do I collect?','Once you’ve paid in full, book a time from your invoice. We confirm it with the seller and send you the address and a 6-digit release code. Collect within {{COLLECT_DAYS}} business days. Give the seller the code only when you’re with the vehicle and happy with it.'],
    ['Can someone else collect for me?','Yes. Name them when you book. They need photo ID matching that name, and we text them the release code.'],
    ['What if I can’t collect in time?','Ask us before the window ends. Otherwise storage of {{STORAGE}} a day applies.'],
    ['Can you deliver?','Use the transport quote on any listing to get a price to your postcode.']]],
   ['h-returns','Claims and returns',[
    ['Can I return a vehicle?','Not for change of mind. Vehicles are sold as is, where is, with no cooling-off period. Inspect before you bid.'],
    ['What if it’s not as described?','If it’s materially different from the listing (wrong year, VIN or transmission, an undisclosed write-off or finance, major damage we didn’t show), lodge a claim from your invoice before handover or within {{CLAIM_DAYS}} business days after. If it’s upheld you can cancel for a full refund.'],
    ['How accurate is the condition report?','It’s a guide from a visual walkaround and what the seller declares in writing. It isn’t a mechanical or roadworthy inspection. The facts (VIN, rego, PPSR) are checked by us.']]],
   ['h-scams','Staying safe',[
    ['How do I know a message is really from Tyrebiter?','Our emails come from @tyrebiter.com.au and our texts from “Tyrebiter”. Links go to tyrebiter.com.au. We’ll never ask for your password or card number by email or SMS.'],
    ['Someone asked me to pay them directly.','Don’t. Only ever pay Tyrebiter, using the details on your invoice page. Report it to us on {{PHONE}}.'],
    ['I got an email saying your bank details changed.','That’s a scam. Our bank details never change by email. Call us before you pay anything.']]],
   ['h-sell','Selling',[
    ['How does selling work?','Request a free appraisal. We visit to photograph the vehicle and write the condition report, you sign your seller agreement online (verify your ID, answer a few questions, add your bank details), and we run a 7-day auction. We book ID-verified buyers in to inspect, take payment, and you hand over the keys when the buyer gives you their release code.'],
    ['What does it cost?','Seller fee: {{SELLER_FEE}}. No charge for photos, the condition report or the PPSR search.'],
    ['What if bidding doesn’t reach my reserve?','We send you the highest bid. Accept or decline it in your seller dashboard within {{REFERRAL_DAYS}} business days. If you decline, we open offers.'],
    ['When do I get paid?','Within {{PAYOUT_DAYS}} business days after the buyer collects and their {{CLAIM_DAYS}}-business-day claim window closes, less our fees. If there’s finance owing, we pay your lender first.'],
    ['Can I bid on my own vehicle?','No, and nor can anyone bidding for you. It breaks our agreement, and shill bidding can breach consumer law.']]],
  ];

export const PRIVACY: [string, string][] = [
   ['Who we are','{{LEGAL_NAME}} (ABN {{ABN}}). We handle personal information under the Privacy Act 1988 and the Australian Privacy Principles.'],
   ['What we collect','Buyers: name, date of birth, address, email, mobile, company and ABN if given, the result of your ID check, card tokens from our payment provider, bids, offers, purchases, questions and how you use the site. Sellers: the same identity details, plus vehicle ownership papers, answers about the vehicle, finance and lender details, and bank details for your payout.'],
   ['Why we collect it','To run auctions, verify identity, check ownership and PPSR status, take and make payments, arrange inspections and collection, prevent fraud and shill bidding, send the alerts you choose, and meet our legal obligations (including record keeping).'],
   ['Who we share it with','Sellers get the buyer’s (and collector’s) name for collection and transfer papers. ID-verified buyers who book an inspection, and the buyer, get the seller’s address. We also share with our identity-verification provider (Stripe Identity), payment provider (Stripe), SMS and email providers (Twilio, Resend), hosting providers (Vercel, Supabase), your lender for a payout, transport providers you book, and authorities where the law requires. Some providers store data outside Australia.'],
   ['Card, bank and ID details','Card numbers are held by Stripe, never by Tyrebiter. ID documents are checked by Stripe Identity; we keep the result, not a copy of your document. Seller bank details and ownership papers are stored securely and seen only by our team.'],
   ['How long we keep it','For as long as your account is open, and afterwards for as long as the law requires for sale and tax records (generally 7 years).'],
   ['Access, correction and deletion','See and update your details in your account, or ask us for a copy of what we hold. You can delete your account yourself, in the app or on the website (Account, then Delete my account), once nothing is in progress (live bids, a purchase not yet paid for and collected, or a vehicle for sale). We then delete your personal details and keep only the sale and tax records the law requires.'],
   ['Our apps','If you allow notifications, we store your phone’s push token, its platform and the app version, so we can send the alerts you choose (you can turn each kind off in the app). The app uses your camera or photos only when you choose to add photos to a claim or an appraisal. We don’t use advertising identifiers, track you across other apps or websites, or collect your location.'],
   ['Marketing','We only send marketing if you opt in, and every optional email and SMS has a link to manage your alerts or unsubscribe.'],
   ['Complaints','Contact our privacy officer at [privacy@tyrebiter.com.au]. If you’re not satisfied, you can contact the Office of the Australian Information Commissioner (OAIC).']
  ];

// ---------------------------------------------------------------------------
// Fills {{TOKENS}} with the live fees and settings.
// ---------------------------------------------------------------------------
type Settings = Record<string, Record<string, unknown> | undefined>;
const aud = (n: unknown) => `$${Number(n || 0).toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;

export function legalValues(s: Settings): Record<string, string> {
  const f = { premium_rate: 0.1, admin_fee: 99, card_limit: 5000, nrd_low: 500, nrd_high: 1000, nrd_split: 20000, cancel_fee: 250, cancel_above: 1000,
    storage_per_day: 50, seller_fee_rate: 0, seller_fee_min: 0, withdrawal_fee: 250, ...(s.fees || {}) } as Record<string, number>;
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
  };
}

export function fillLegal<T>(content: T, settings: Settings): T {
  const v = legalValues(settings);
  return JSON.parse(JSON.stringify(content).replace(/\{\{(\w+)\}\}/g, (m, k) => (v[k] ?? m).replace(/"/g, '\\"')));
}
