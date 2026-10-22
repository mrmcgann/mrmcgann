-- Sample lots for local development and your first look at the live site.
-- Delete these from the admin area before launch.
-- Setting up sample listings isn't a correction: don't log these edits or alert anyone about them.
alter table public.lots disable trigger lot_corrections_log;

insert into public.lots (id, status, title, short_title, subtitle, vehicle_type, category, year, make, model, variant, body, engine, transmission, fuel, odometer, colour, seats, keys, suburb, state, postcode, backdrop, take, owner_note, service_history, known_faults, roadworthy_note, ppsr_clear, visual_grade, grade_paint, grade_interior, grade_tyres, tyre_tread, buy_now_price, start_price, current_bid, bid_count, starts_at, ends_at) values
(10432,'live','2009 Toyota Corolla Ascent','2009 Toyota Corolla','Ascent sedan. One owner. Dealer service history.','car','cars',2009,'Toyota','Corolla','Ascent','4-door sedan','1.8L 4-cyl','Auto','Petrol',214300,'Silver',5,2,'Eagle Farm','QLD','4009','sun',
 'A one-owner Corolla Ascent with a complete dealer service history. 1.8-litre petrol, four-speed automatic, air conditioning and cruise control. Two keys and the logbooks are included.',
 'Bought in 2011 and serviced at the same dealer since. Selling as we have moved to a seven-seater.',
 'Dealer stamped logbook','None declared','Not included','t','B','B','B','C','FL 4.5 · FR 4.0 · RL 5.5 · RR 5.0 mm',null,500,500,0, now(), now() + interval '2 days 4 hours'),
(10588,'live','2014 Isuzu NPR 45-155 Tipper','2014 Isuzu NPR Tipper','4.5 t GVM tipper. Drivable on a car licence.','truck','trucks',2014,'Isuzu','NPR','45-155','Tipper','5.2L turbo-diesel','Manual','Diesel',312000,'White',3,1,'Toowoomba','QLD','4350','lime',
 'Isuzu NPR 45-155 tipper with a 4,500 kg GVM, drivable on a car licence. 5.2-litre turbo-diesel with a manual gearbox. The hoist was serviced last year. Used by an owner-driver for landscaping supplies.',
 'Used for landscaping supplies. Selling on retirement.',
 'Partial','Worn driver seat','Not included','t','B','C','B','B',null,null,5000,5000,0, now(), now() + interval '5 hours'),
(10611,'live','2012 Mazda2 Neo','2012 Mazda2 Neo','Five-door hatch. Automatic. Economical 1.5-litre.','car','cars',2012,'Mazda','2','Neo','5-door hatch','1.5L 4-cyl','Auto','Petrol',168900,'Red',5,1,'Parramatta','NSW','2150','berry',
 'Mazda2 Neo five-door hatch with the 1.5-litre petrol engine and four-speed automatic. Compact and economical, with low running costs. Suited to a first car.',
 'Our daughter''s first car. No longer needed after a move interstate.',
 'Some receipts','None declared','Not included','t','C','C','B','C',null,null,500,500,0, now(), now() + interval '1 day 9 hours'),
(10599,'live','2017 Ford Ranger XLT 3.2','2017 Ford Ranger XLT','Dual cab 4x4. Towbar and tub liner. Full logbook history.','ute','utes',2017,'Ford','Ranger','XLT 3.2','Dual-cab ute','3.2L 5-cyl diesel','Auto','Diesel',142000,'Blue',5,2,'Dandenong','VIC','3175','sky',
 'PX2 Ranger XLT dual cab 4x4 with the 3.2-litre five-cylinder turbo-diesel and six-speed automatic. Former fleet vehicle with a full logbook service history. Fitted with a towbar and tub liner.',
 'Company vehicle, replaced under our fleet cycle.',
 'Full logbook','None declared','Not included','t','B','B','B','B',null,null,5000,5000,0, now(), now() + interval '3 hours 40 minutes'),
(10620,'live','2006 Holden Commodore VE Omega','2006 Holden Commodore','Omega sedan. 3.6-litre V6. Garaged.','car','cars',2006,'Holden','Commodore','VE Omega','4-door sedan','3.6L V6','Auto','Petrol',231500,'White',5,1,'Elizabeth','SA','5112','tangerine',
 'VE Commodore Omega sedan with the 3.6-litre V6 and automatic transmission. Seats five with a large boot. Garaged by its previous owner.',
 'My father''s car. Always garaged.',
 'Some receipts','Dash rattle','Not included','t','C','C','C','C',null,null,500,500,0, now(), now() + interval '38 minutes'),
(10633,'live','2015 Hyundai i30 Active','2015 Hyundai i30 Active','Five-door hatch. Reversing camera. Full logbook.','car','cars',2015,'Hyundai','i30','Active','5-door hatch','1.8L 4-cyl','Auto','Petrol',121400,'Grey',5,2,'Moonah','TAS','7009','lilac',
 'GD i30 Active hatch with the 1.8-litre petrol engine and six-speed automatic. Reversing camera, Bluetooth and cruise control. Full logbook service history and two keys.',
 'Our second car, used mainly for school runs.',
 'Full logbook','None declared','Not included','t','A','A','A','B',null,8900,1000,1000,0, now(), now() + interval '2 days 11 hours'),
(10590,'live','2008 Kenworth T401 Prime Mover','2008 Kenworth T401','Owner-driver prime mover. Engine rebuilt at 850,000 km.','truck','trucks',2008,'Kenworth','T401','','Prime mover','Cummins ISX','Manual','Diesel',1120000,'Red',2,1,'Townsville','QLD','4810','coral',
 'Kenworth T401 prime mover with a Cummins ISX and manual transmission. Owner-driven on north Queensland runs, with full service records. The engine was rebuilt at 850,000 km.',
 'My truck for nine years on north Queensland runs.',
 'Full records','Oil weep, monitored','Not included','t','C','C','C','C',null,null,10000,10000,0, now(), now() + interval '6 hours 55 minutes');

insert into public.lot_private (lot_id, reserve_price, seller_name, seller_phone, seller_address) values
(10432, 3200, 'Sample Seller', '0400000000', 'Sample address, Eagle Farm QLD 4009'),
(10588, 30000, 'Sample Seller', '0400000000', 'Sample address, Toowoomba QLD 4350'),
(10611, null, 'Sample Seller', '0400000000', 'Sample address, Parramatta NSW 2150'),
(10599, 24000, 'Sample Seller', '0400000000', 'Sample address, Dandenong VIC 3175'),
(10620, null, 'Sample Seller', '0400000000', 'Sample address, Elizabeth SA 5112'),
(10633, 5800, 'Sample Seller', '0400000000', 'Sample address, Moonah TAS 7009'),
(10590, 50000, 'Sample Seller', '0400000000', 'Sample address, Townsville QLD 4810');

insert into public.lot_flaws (lot_id, title, note, sort) values
(10432,'Scuff, rear bumper','Cosmetic, about 8 cm.',1),(10432,'Stone chip, windscreen','Outside the driver''s view.',2),(10432,'Seat bolster wear','Fabric intact, no tears.',3),
(10588,'Tray dents','Normal tipper wear.',1),(10588,'Cracked mirror housing','Glass fine.',2),
(10611,'Faded roof paint','Sun damage, cosmetic.',1),(10611,'Kerbed alloy wheel','Front left.',2),
(10599,'Tub liner scratches','Normal use.',1),(10599,'Small door ding','Rear passenger door.',2),
(10620,'Clear coat peeling','Bonnet and roof.',1),(10620,'Headlight haze','Both sides.',2),
(10633,'Light swirl marks','Paint, polishable.',1),
(10590,'Stone-chipped bullbar','Cosmetic.',1),(10590,'Oil weep','Noted in report.',2);

-- Samples from the other categories (motorbikes, caravans, boats)
insert into public.lots (id, status, title, short_title, subtitle, vehicle_type, category, kind, year, make, model, variant, body, engine, engine_cc, lams, transmission, fuel, odometer, hours, berths, length_m, colour, seats, keys, suburb, state, postcode, backdrop, take, owner_note, service_history, known_faults, roadworthy_note, ppsr_clear, visual_grade, grade_paint, grade_interior, grade_tyres, buy_now_price, start_price, current_bid, bid_count, starts_at, ends_at, published_at) values
(10660,'live','2020 Yamaha MT-07 LAMS','2020 Yamaha MT-07','LAMS approved. One owner. Garaged.','bike','motorbikes','road',2020,'Yamaha','MT-07','LAMS','Naked','689cc parallel twin',689,true,'Manual','Petrol',12400,null,null,null,'Grey',2,2,'Geelong','VIC','3220','berry',
 'Learner-approved MT-07 with the 689 cc parallel twin. One owner from new, dealer serviced and garaged. Never dropped, as declared by the seller.',
 'Bought new for my learner licence. Serviced on time.','Dealer serviced','None declared','Not included','t','A','A','A','B',null,3000,3000,0, now(), now() + interval '1 day 6 hours', now()),
(10661,'live','2016 Jayco Starcraft Pop-top','2016 Jayco Starcraft','Pop-top. Sleeps four. Annual bearing service.','caravan','caravans','pop-top',2016,'Jayco','Starcraft','16.55-3','Pop-top caravan',null,null,null,null,null,null,null,4,5.6,'White',null,2,'Toowoomba','QLD','4350','mint',
 'Jayco Starcraft pop-top, 5.6 m, sleeping four. Light enough to tow with a mid-size SUV. Canvas in good condition for its age. Wheel bearings serviced annually.',
 'Our family van for six summers. Upgrading to a hybrid camper.','Annual bearing service','Awning arm sticks','Not included','t','B','B','B','B',null,10000,10000,0, now(), now() + interval '3 days', now()),
(10662,'live','2019 Quintrex 420 Hornet','2019 Quintrex Hornet','4.2 m tinny with 40 hp Yamaha and trailer.','boat','boats','tinny',2019,'Quintrex','Hornet','420','Open aluminium boat','40hp Yamaha outboard',null,null,null,'Petrol',null,140,null,4.2,'Silver',4,1,'Bunbury','WA','6230','blueberry',
 'Quintrex Hornet 420 open aluminium boat with a 40 hp Yamaha outboard, on its own trailer. 140 hours. Easy to launch and retrieve single-handed.',
 'Used for estuary fishing a few times a year. Outboard serviced each season.','Outboard serviced yearly','None declared','Not included','t','B','B','B','B',null,6000,6000,0, now(), now() + interval '4 days', now());

insert into public.lot_private (lot_id, reserve_price, seller_name, seller_phone, seller_address) values
(10660, null, 'Sample Seller', '0400000000', 'Sample address, Geelong VIC 3220'),
(10661, null, 'Sample Seller', '0400000000', 'Sample address, Toowoomba QLD 4350'),
(10662, null, 'Sample Seller', '0400000000', 'Sample address, Bunbury WA 6230');

select setval('public.lot_number_seq', 10700);
update public.lots set featured = true where id = 10432;

-- Sample consultant and partners so the finance, insurance and inspection tools have something to show.
-- They're marked as samples: replace them with your real consultants and signed partners before launch.
insert into public.consultants (name, title, phone, email, is_default) values
  ('Sample Consultant', 'Vehicle consultant', '1300 000 000', 'sales@tyrebiter.com.au', true);
update public.lots set consultant_id = (select id from public.consultants where is_default) where consultant_id is null;

insert into public.partners (kind, slug, name, licence, blurb, rate_from, comparison_rate, comparison_basis, establishment_fee, monthly_fee, min_amount, max_amount, min_term_months, max_term_months, referral_url, commission_note, sample, active, sort) values
  ('finance', 'sample-lender-a', 'Sample Lender A', 'ACL 000001 (sample)', 'Secured car loans for private buyers.', 7.49, 8.12, '$30,000 secured loan over 5 years', 395, 8, 5000, 150000, 12, 84, 'https://example.com/apply?amount={amount}&term={term}', 'Sample: Tyrebiter receives up to $1,500 from this lender if your loan settles.', true, true, 1),
  ('finance', 'sample-lender-b', 'Sample Lender B', 'ACL 000002 (sample)', 'Car and truck finance, including ABN holders.', 8.95, 9.60, '$30,000 secured loan over 5 years', 250, 10, 3000, 250000, 12, 84, 'https://example.com/apply?amount={amount}&term={term}', 'Sample: Tyrebiter receives up to $1,200 from this lender if your loan settles.', true, true, 2),
  ('finance', 'sample-broker-c', 'Sample Broker C', 'ACL 000003 (sample)', 'A broker comparing 30+ lenders.', 6.99, 7.85, '$30,000 secured loan over 5 years', 490, 0, 5000, 200000, 24, 84, 'https://example.com/quote?amount={amount}&term={term}', 'Sample: Tyrebiter receives 0.8% of the amount borrowed from this broker if your loan settles.', true, true, 3);

insert into public.partners (kind, slug, name, licence, blurb, features, pds_url, tmd_url, referral_url, commission_note, sample, active, sort) values
  ('insurance', 'sample-insurer-a', 'Sample Insurer A', 'AFSL 000001 (sample)', 'Comprehensive and third party cover.', '{"agreed_value": "Agreed or market value", "new_car_replacement": "Under 2 years old", "choice_of_repairer": "Optional extra", "hire_car": "After theft", "excess_from": 600, "monthly_payments": "No extra cost", "roadside": "Optional extra"}', 'https://example.com/pds', 'https://example.com/tmd', 'https://example.com/quote?make={make}&model={model}&year={year}&postcode={postcode}', 'Sample: Tyrebiter receives $40 from this insurer if you buy a policy.', true, true, 1),
  ('insurance', 'sample-insurer-b', 'Sample Insurer B', 'AFSL 000002 (sample)', 'Car, ute and light truck cover.', '{"agreed_value": "Market value", "new_car_replacement": "Under 3 years old", "choice_of_repairer": "Included", "hire_car": "Optional extra", "excess_from": 750, "monthly_payments": "Small fee", "roadside": "Included"}', 'https://example.com/pds', 'https://example.com/tmd', 'https://example.com/quote?make={make}&model={model}&year={year}&postcode={postcode}', 'Sample: Tyrebiter receives $40 from this insurer if you buy a policy.', true, true, 2),
  ('insurance', 'sample-compare-c', 'Sample Comparison C', 'AFSL 000003 (sample)', 'Compares quotes from several insurers.', '{"agreed_value": "Depends on insurer", "new_car_replacement": "Depends on insurer", "choice_of_repairer": "Depends on insurer", "hire_car": "Depends on insurer", "monthly_payments": "Depends on insurer", "roadside": "Depends on insurer"}', null, null, 'https://example.com/compare?make={make}&model={model}&year={year}&postcode={postcode}', 'Sample: Tyrebiter receives $40 from this insurer if you buy a policy.', true, true, 3);

insert into public.partners (kind, slug, name, licence, blurb, price_from, turnaround, referral_url, commission_note, sample, active, sort) values
  ('inspection', 'sample-inspections', 'Sample Mobile Inspections', null, 'An independent mechanic inspects the vehicle where it is and sends you a written report with photos.', 249, 'Usually within 2 business days', null, 'Sample: Tyrebiter receives $30 from the inspection provider for each inspection.', true, true, 1);
insert into public.partner_private (partner_id, lead_email) select id, 'partners@tyrebiter.com.au' from public.partners where sample;

-- Registration for the sample vehicles (made-up plates). Delete with the sample vehicles.
update public.lots set registration = 'registered', rego_state = state, rego_plate = 'SMPL' || right(id::text, 2),
  rego_expiry = (current_date + interval '5 months')::date
  where id in (10432, 10588, 10590, 10599, 10611, 10620, 10633, 10660, 10661) and registration is null;
update public.lots set registration = 'unregistered' where registration is null;

-- Made-up VINs for the sample vehicles (they also teach the free VIN lookup). Delete with the sample vehicles.
update public.lots l set vin = v.vin from (values
  (10432, 'JTNBV58E09J000432'), (10588, 'JAANPR85HE7000588'), (10590, '6F4T401K08B000590'), (10599, 'MNAUMFF50HW000599'), (10611, 'JM0DE1023C0000611'),
  (10620, '6G1EK52W06L000620'), (10633, 'KMHD3510AFU000633'), (10660, 'JYARM33E0LA000660'), (10661, '6T9T16CARGJ000661')
) v(id, vin) where l.id = v.id and l.vin is null;

-- The sample vehicles' listing checks were done from the seller's photos, video and records before listing,
-- and the seller's video shows whether they start and drive. Delete with the sample vehicles.
update public.lots set verified = public.listing_check_keys(), verified_at = coalesce(published_at, now()),
  runs = case when id = 10662 then 'untested' else 'drives' end,
  write_off_status = case when write_off_status = 'unknown' then 'none' else write_off_status end
  where status <> 'draft';

-- Sample depots: our transport partner's yards, where buyers collect (listings show the depot, never the seller's
-- suburb). Replace them with your real depots before launch. Each sample vehicle collects from the depot in its
-- town, with a sample transport amount (pickup from the seller to the depot, before GST) in its buyer's premium.
insert into public.depots (name, suburb, state, postcode, hours) values
  ('Sample Depot Eagle Farm', 'Eagle Farm', 'QLD', '4009', 'Monday to Friday, 8am to 4pm'),
  ('Sample Depot Toowoomba', 'Toowoomba', 'QLD', '4350', 'Monday to Friday, 8am to 4pm'),
  ('Sample Depot Townsville', 'Townsville', 'QLD', '4810', 'Monday to Friday, 7am to 3pm'),
  ('Sample Depot Parramatta', 'Parramatta', 'NSW', '2150', 'Monday to Friday, 8am to 4pm'),
  ('Sample Depot Dandenong', 'Dandenong', 'VIC', '3175', 'Monday to Friday, 8am to 4pm'),
  ('Sample Depot Geelong', 'Geelong', 'VIC', '3220', 'Monday to Friday, 8am to 4pm'),
  ('Sample Depot Elizabeth', 'Elizabeth', 'SA', '5112', 'Monday to Friday, 8am to 4pm'),
  ('Sample Depot Moonah', 'Moonah', 'TAS', '7009', 'Monday to Friday, 8am to 3pm'),
  ('Sample Depot Bunbury', 'Bunbury', 'WA', '6230', 'Monday to Friday, 8am to 4pm');
insert into public.depot_private (depot_id, address, phone, email)
  select id, 'Sample yard, ' || suburb || ' ' || state || ' ' || postcode, '0400000001', 'depot@tyrebiter.com.au' from public.depots;
alter table public.lots disable trigger lot_transport_lock;
update public.lots l set depot_id = d.id, statutory_warranty = false,
  transport_fee = case l.category when 'trucks' then 650 when 'caravans' then 450 when 'boats' then 350 when 'motorbikes' then 180 else 250 end
  from public.depots d where d.suburb = l.suburb and d.state = l.state;
update public.lots set fees = fees || jsonb_build_object('transport', transport_fee) where fees is not null and transport_fee is not null;
alter table public.lots enable trigger lot_transport_lock;

-- Sample transport and warranty partners (shown in test mode only). Replace before launch.
insert into public.partners (kind, slug, name, licence, blurb, price_from, turnaround, referral_url, commission_note, sample, active, sort, accepts_leads) values
  ('transport', 'sample-carrier', 'Sample Car Carrier', null, 'Door-to-door vehicle transport between capital cities and regional centres, with tracking.', null, 'Quotes usually within 1 business day', null, 'We may receive a referral fee from Sample Car Carrier.', true, true, 1, true);
insert into public.partners (kind, slug, name, licence, blurb, features, pds_url, tmd_url, referral_url, commission_note, sample, active, sort, accepts_leads) values
  ('warranty', 'sample-warranty', 'Sample Warranty Co', 'AFSL 000004 (sample)', 'Mechanical breakdown cover with optional 24/7 roadside assistance.', '{"terms": "1 to 3 years", "roadside": "Optional", "claim_limit": "Up to the vehicle''s value", "excess": "From $0", "age_limit": "Under 15 years and 250,000 km"}', 'https://example.com/pds', 'https://example.com/tmd', 'https://example.com/warranty?ref=tyrebiter', 'We may receive a commission from Sample Warranty Co if you buy.', true, true, 1, true);
insert into public.partner_private (partner_id, lead_email) select id, 'partners@tyrebiter.com.au' from public.partners where sample and kind in ('transport', 'warranty');

-- A sample live auction. Every vehicle is sold in a live auction (like Turners Live), so the sample vehicles wait in
-- this one, taking early bids, each with a sample auction estimate (its basis kept on file) and, where its state needs
-- one to transfer the registration, the seller's certificate. The clock never runs it (auto_advance is off): start it
-- from Admin → Live auctions to see how a sale runs, and delete it with the sample vehicles. Before launch, every
-- real sale names your licensed auctioneer.
do $$
declare v_today date := (now() at time zone 'Australia/Brisbane')::date; v_days int; v_sale bigint;
begin
  if not public.live_only() then return; end if;
  v_days := (4 - extract(isodow from v_today)::int + 7) % 7;  -- the next Thursday at least 2 days away, 7pm Brisbane time
  if v_days < 2 then v_days := v_days + 7; end if;
  insert into public.sales (slug, title, intro, published, mode, starts_at, auctioneer, auto_advance, lot_seconds, extend_seconds)
  values ('sample-live-auction', 'Sample live auction', 'Sample vehicles, to show how our live auctions work.', true, 'live',
          ((v_today + v_days) + time '19:00') at time zone 'Australia/Brisbane', 'Sample Auctioneer', false, 60, 20)
  returning id into v_sale;
  update public.lots set gvm_kg = 22500 where id = 10590 and gvm_kg is null;
  update public.lots l set buy_now_price = null, method = 'auction', sale_id = v_sale, sale_order = o.n,
         estimate_low = o.lo, estimate_high = o.hi, roadworthy_note = null
    from (values (10432, 1, 3500, 4300), (10611, 2, 5500, 6800), (10633, 3, 6000, 7500), (10620, 4, 3000, 4000),
                 (10599, 5, 25000, 30000), (10660, 6, 7000, 8500), (10661, 7, 24000, 29000), (10662, 8, 14000, 17000),
                 (10588, 9, 32000, 38000), (10590, 10, 52000, 62000)) o(id, n, lo, hi)
   where l.id = o.id;
  update public.lot_private set estimate_basis = 'Sample estimate: recent sales of similar vehicles (same model, age and kilometres). Replace with your own evidence.'
   where lot_id in (select id from public.lots where sale_id = v_sale);
  update public.lots set roadworthy_issued_on = v_today - 3
   where sale_id = v_sale and registration = 'registered'
     and public.roadworthy_needed(coalesce(rego_state, state), year, category, gvm_kg) is not null;
  perform public.live_estimates(v_sale);
end $$;

alter table public.lots enable trigger lot_corrections_log;
