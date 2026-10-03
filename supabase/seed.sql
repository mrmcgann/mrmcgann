-- Sample lots for local development and your first look at the live site.
-- Delete these from the admin area before launch.

insert into public.lots (id, status, title, short_title, subtitle, vehicle_type, category, year, make, model, variant, body, engine, transmission, fuel, odometer, colour, seats, keys, suburb, state, postcode, backdrop, take, owner_note, service_history, known_faults, roadworthy_note, ppsr_clear, visual_grade, grade_paint, grade_interior, grade_tyres, tyre_tread, buy_now_price, start_price, current_bid, bid_count, starts_at, ends_at) values
(10432,'live','2009 Toyota Corolla Ascent','2009 Toyota Corolla','Ascent sedan. One owner. Every service stamped.','car','cars',2009,'Toyota','Corolla','Ascent','4-door sedan','1.8L 4-cyl','Auto','Petrol',214300,'Silver',5,2,'Eagle Farm','QLD','4009','sun',
 'The car your mechanic quietly wishes everyone drove. Cheap to insure, cheap to fix, and still starting every morning long after the payments on something newer have run out.',
 'Bought it in 2011 and serviced it at the same dealer the whole way. The books are in the glovebox. Only selling because we''ve moved to a 7-seater.',
 'Dealer stamped logbook','None declared','Not included','t','B','B','B','C','FL 4.5 · FR 4.0 · RL 5.5 · RR 5.0 mm',null,500,500,0, now(), now() + interval '2 days 4 hours'),
(10588,'live','2014 Isuzu NPR 45-155 Tipper','2014 Isuzu NPR Tipper','4.5 t tipper. Car licence. Ready for work Monday.','truck','trucks',2014,'Isuzu','NPR','45-155','Tipper','5.2L turbo-diesel','Manual','Diesel',312000,'White',3,1,'Toowoomba','QLD','4350','lime',
 'The truck every landscaper in Toowoomba seems to own, for good reason. Drives on a car licence, tips cleanly, and Isuzu parts are everywhere.',
 'Owner-driver, used for landscaping supplies. Hoist serviced last year. Selling because I''ve retired.',
 'Partial','Worn driver seat','Not included','t','B','C','B','B',null,null,5000,5000,0, now(), now() + interval '5 hours'),
(10611,'live','2012 Mazda2 Neo','2012 Mazda2 Neo','Zippy hatch. Easy to park, easy on fuel.','car','cars',2012,'Mazda','2','Neo','5-door hatch','1.5L 4-cyl','Auto','Petrol',168900,'Red',5,1,'Parramatta','NSW','2150','berry',
 'A proper first car. Small enough for any car park, cheap to insure for a P-plater, and more fun to drive than it has any right to be.',
 'Our daughter''s first car. She''s moved to Melbourne and doesn''t need it.',
 'Some receipts','None declared','Not included','t','C','C','B','C',null,null,500,500,0, now(), now() + interval '1 day 9 hours'),
(10599,'live','2017 Ford Ranger XLT 3.2','2017 Ford Ranger XLT','Dual cab. Towbar. Tub liner. Ready for anything.','ute','utes',2017,'Ford','Ranger','XLT 3.2','Dual-cab ute','3.2L 5-cyl diesel','Auto','Diesel',142000,'Blue',5,2,'Dandenong','VIC','3175','sky',
 'Australia''s favourite tool of the trade. The 3.2 pulls like a train and the XLT has everything you actually use.',
 'Company vehicle, logbook serviced. Replaced under our fleet cycle.',
 'Full logbook','None declared','Not included','t','B','B','B','B',null,null,5000,5000,0, now(), now() + interval '3 hours 40 minutes'),
(10620,'live','2006 Holden Commodore VE Omega','2006 Holden Commodore','Big, comfortable, honest. A true Aussie classic.','car','cars',2006,'Holden','Commodore','VE Omega','4-door sedan','3.6L V6','Auto','Petrol',231500,'White',5,1,'Elizabeth','SA','5112','tangerine',
 'Made in Elizabeth, sold in Elizabeth. Room for five, a boot for a week away, and a V6 that''ll outlast most of what''s parked next to it.',
 'Dad''s car. Always garaged. Time for it to go to a new home.',
 'Some receipts','Dash rattle','Not included','t','C','C','C','C',null,null,500,500,0, now(), now() + interval '38 minutes'),
(10633,'live','2015 Hyundai i30 Active','2015 Hyundai i30 Active','Smart hatch. Reversing camera. Low kilometres.','car','cars',2015,'Hyundai','i30','Active','5-door hatch','1.8L 4-cyl','Auto','Petrol',121400,'Grey',5,2,'Moonah','TAS','7009','lilac',
 'Everything a modern hatch should be. Well built, well equipped, and still with plenty of life ahead of it.',
 'Second car for the family, used mainly for school runs.',
 'Full logbook','None declared','Not included','t','A','A','A','B',null,8900,1000,1000,0, now(), now() + interval '2 days 11 hours'),
(10590,'live','2008 Kenworth T401 Prime Mover','2008 Kenworth T401','Owner-driver prime mover. Honest, working truck.','truck','trucks',2008,'Kenworth','T401','','Prime mover','Cummins ISX','Manual','Diesel',1120000,'Red',2,1,'Townsville','QLD','4810','coral',
 'A proper owner-driver''s truck. It has done the work, and the service records show it has been looked after.',
 'My truck for 9 years, north Queensland runs. Engine rebuilt at 850,000 km.',
 'Full records','Oil weep, monitored','Not included','t','C','C','C','C',null,null,10000,10000,0, now(), now() + interval '6 hours 55 minutes');

insert into public.lot_private (lot_id, reserve_price, seller_name, seller_phone, seller_address) values
(10432, 3200, 'Sample Seller', '0400000000', '[address]'),
(10588, 30000, 'Sample Seller', '0400000000', '[address]'),
(10611, null, 'Sample Seller', '0400000000', '[address]'),
(10599, 24000, 'Sample Seller', '0400000000', '[address]'),
(10620, null, 'Sample Seller', '0400000000', '[address]'),
(10633, 5800, 'Sample Seller', '0400000000', '[address]'),
(10590, 50000, 'Sample Seller', '0400000000', '[address]');

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
(10660,'live','2020 Yamaha MT-07 LAMS','2020 Yamaha MT-07','Learner-approved naked bike. One owner, garaged.','bike','motorbikes','road',2020,'Yamaha','MT-07','LAMS','Naked','689cc parallel twin',689,true,'Manual','Petrol',12400,null,null,null,'Grey',2,2,'Geelong','VIC','3220','berry',
 'The bike that every rider seems to own at some point, for good reason. Torquey, light and forgiving, and it will still be fun long after your Ps.',
 'Bought new for my learner licence. Never dropped, always garaged, serviced on time.','Dealer serviced','None declared','Not included','t','A','A','A','B',null,3000,3000,0, now(), now() + interval '1 day 6 hours', now()),
(10661,'live','2016 Jayco Starcraft Pop-top','2016 Jayco Starcraft','Pop-top, sleeps four, ready for the next trip.','caravan','caravans','pop-top',2016,'Jayco','Starcraft','16.55-3','Pop-top caravan',null,null,null,null,null,null,null,4,5.6,'White',null,2,'Toowoomba','QLD','4350','mint',
 'Light enough to tow with a mid-size SUV and roomy enough for a family of four. The canvas is in better shape than most we see.',
 'Our family van for six summers. Kids have grown up and we are buying a hybrid camper.','Annual bearing service','Awning arm sticks','Not included','t','B','B','B','B',null,10000,10000,0, now(), now() + interval '3 days', now()),
(10662,'live','2019 Quintrex 420 Hornet','2019 Quintrex Hornet','Tinny on its own trailer. Ready for the river.','boat','boats','tinny',2019,'Quintrex','Hornet','420','Open aluminium boat','40hp Yamaha outboard',null,null,null,'Petrol',null,140,null,4.2,'Silver',4,1,'Bunbury','WA','6230','blueberry',
 'The boat that taught half of Australia to fish. Simple, tough and easy to launch on your own.',
 'Used for estuary fishing a few times a year. Outboard serviced every season.','Outboard serviced yearly','None declared','Not included','t','B','B','B','B',null,6000,6000,0, now(), now() + interval '4 days', now());

select setval('public.lot_number_seq', 10700);
update public.lots set featured = true where id = 10432;
