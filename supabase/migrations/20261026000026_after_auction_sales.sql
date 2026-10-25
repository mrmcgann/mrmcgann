-- Tyrebiter: selling a vehicle after the auction, by agreement, in every state where the law allows it.
--
-- A vehicle passed in (below its reserve, with no bids, or not offered), or whose buyer didn't pay, can be sold after
-- the auction by private treaty: the seller agrees the price in writing (from their seller dashboard, or in writing to
-- their consultant, recorded by staff and confirmed to them), and the consultant sends a written offer at that price or
-- more to someone who bid on or watched it, with our contract and the state's own forms. The buyer signs the offer to
-- accept it. It isn't a sale by auction, so the protections of that state for a dealer's private-treaty sale apply: its
-- cooling-off period where it has one (every buyer there gets it, free, and a business day longer), the statutory
-- warranty or dealer's duty to repair where it applies (we carry it), and its notices. Never in Victoria (a consigned
-- vehicle can only be sold there at auction); Tasmania and the Northern Territory only once the licence that covers it is
-- held (switched on in Admin settings). The relist made at the pass-in stays the fallback: the sale cancels it, and it
-- can't be published while an offer or a cooling-off period is open. docs/legal-basis.md, section 5, has the law.
--
-- 1. The states and their rules: after_auction_states(), state_tz(), after_auction_rule(), cooling_off_end()
-- 2. Tables: second_chance_offers carries after-auction offers; lots.sold_via 'after_auction'; seller_decisions
--    'accept_after' / 'withdraw_after' (with a note); the private bucket for the state's forms
-- 3. after_auction_check(lot): can it be sold after the auction now, and under which rules
-- 4. The seller's written agreement: seller_accept_after, seller_withdraw_after, admin_seller_agreed
-- 5. The offer and the buyer: admin_after_offer, admin_after_withdraw, respond_after_offer, cancel_after_offer
-- 6. The sale: after_sale_complete, finish_after_offers (the clock); a deal in its cooling-off period holds the deposit
-- 7. Notices and the relist: queue_status_notices, live_pass_unoffered, queue_passed_followup, lot_publish_check,
--    admin_offer_next_bidder
-- 8. What the seller sees: seller_lot_after(lot)
-- 9. New versions of the Terms of Sale and the seller agreement

-- ---------------------------------------------------------------------------
-- 1. The states and their rules
-- ---------------------------------------------------------------------------
-- On by default where our licences already cover it. Victoria is never on, whatever the setting says.
insert into public.settings (key, value) values ('selling', '{"after_auction_states": ["QLD","NSW","WA","SA","ACT"]}'::jsonb)
on conflict (key) do update set value = coalesce(public.settings.value, '{}'::jsonb)
  || case when public.settings.value ? 'after_auction_states' then '{}'::jsonb else '{"after_auction_states": ["QLD","NSW","WA","SA","ACT"]}'::jsonb end;

create or replace function public.after_auction_states() returns text[]
language plpgsql stable set search_path = public as $$
declare v jsonb;
begin
  select value->'after_auction_states' into v from settings where key = 'selling';
  if v is null or jsonb_typeof(v) <> 'array' then return array['QLD','NSW','WA','SA','ACT']; end if;
  return array(select distinct upper(trim(x)) from jsonb_array_elements_text(v) x
                where upper(trim(x)) in ('QLD','NSW','WA','SA','TAS','ACT','NT'));
end $$;
revoke execute on function public.after_auction_states() from public, anon;
grant execute on function public.after_auction_states() to authenticated, service_role;

create or replace function public.state_tz(p_state text) returns text
language sql immutable as $$
  select case upper(coalesce(p_state, ''))
    when 'NSW' then 'Australia/Sydney' when 'ACT' then 'Australia/Sydney' when 'VIC' then 'Australia/Melbourne'
    when 'TAS' then 'Australia/Hobart' when 'SA' then 'Australia/Adelaide' when 'NT' then 'Australia/Darwin'
    when 'WA' then 'Australia/Perth' else 'Australia/Brisbane' end
$$;
revoke execute on function public.state_tz(text) from public, anon;
grant execute on function public.state_tz(text) to authenticated, service_role;

-- What the law of each state means for a sale after the auction (docs/legal-basis.md, "Selling after the auction").
-- cooling_days: the buyer can cancel, free, until the end of that business day after the day they sign, in the state's
-- own time; one business day more than the law gives, so a state public holiday our calendar doesn't know never makes
-- it shorter. forms: the state's own paperwork staff attach to the offer (from the regulator's templates).
create or replace function public.after_auction_rule(p_state text) returns jsonb
language plpgsql stable set search_path = public as $$
declare st text := upper(coalesce(trim(p_state), '')); v_on boolean := st = any(after_auction_states());
begin
  return jsonb_build_object('state', st, 'tz', state_tz(st)) || case st
    when 'VIC' then jsonb_build_object('allowed', false, 'cooling_days', 0, 'forms', '[]'::jsonb,
      'why', 'Victoria: a consigned vehicle can only be sold at auction (Motor Car Traders Act 1986; Consumer Affairs Victoria), so it goes into the next auction instead.')
    when 'QLD' then jsonb_build_object('allowed', v_on, 'cooling_days', 0, 'forms', '[]'::jsonb,
      'why', case when v_on then null else 'Queensland: selling after the auction is switched off in Admin settings.' end,
      'cooling_law', 'No cooling-off period—sale on consignment. Queensland''s cooling-off period for used cars doesn''t apply to a vehicle a dealer sells for its owner.',
      'warranty_hint', 'Queensland: no statutory warranty for a vehicle sold on consignment for a private seller. A licensee''s own vehicle can carry one (class A or B): check with the seller.',
      'staff_note', 'The consultant who negotiates it must be a registered motor salesperson (or the licensee).')
    when 'NSW' then jsonb_build_object('allowed', v_on, 'cooling_days', 2,
      'forms', '["Form 5: the motor dealer''s notice for the vehicle", "Form 12: the cooling-off period notice"]'::jsonb,
      'why', case when v_on then null else 'New South Wales: selling after the auction is switched off in Admin settings.' end,
      'cooling_law', 'New South Wales law lets a buyer who finances through the dealer change their mind until 5 pm on the next business day. We give every buyer until the end of the second business day after they sign, and cancelling is free.',
      'warranty_hint', 'New South Wales dealer guarantee: a second-hand car no more than 10 years old that has travelled no more than 160,000 km: 3 months or 5,000 km, whichever comes first (a motorcycle under 5 years and 30,000 km: 3 months or 3,000 km). Not vehicles over 4.5 tonnes GVM.')
    when 'SA' then jsonb_build_object('allowed', v_on, 'cooling_days', 3,
      'forms', '["The notice for the vehicle (Second-hand Vehicle Dealers Act 1995, section 16)", "The notice to the purchaser (section 18)", "The cooling-off agreement (section 18C)"]'::jsonb,
      'why', case when v_on then null else 'South Australia: selling after the auction is switched off in Admin settings.' end,
      'cooling_law', 'South Australian law gives a buyer from a dealer 2 clear business days to change their mind. We give every buyer until the end of the third business day after they sign, and cancelling is free.',
      'warranty_hint', 'South Australian duty to repair: a car over $3,000, first registered no more than 15 years ago and driven no more than 200,000 km: 2 months or 3,000 km ($3,001 to $6,000), 3 months or 5,000 km (over $6,000). Not motorcycles. It can''t be waived.')
    when 'WA' then jsonb_build_object('allowed', v_on, 'cooling_days', 0,
      'forms', '["Form 4: vehicle particulars (Motor Vehicle Dealers Act 1973, section 33), signed for us", "The vehicle sale contract with the Schedule 5 terms (section 42A)"]'::jsonb,
      'why', case when v_on then null else 'Western Australia: selling after the auction is switched off in Admin settings.' end,
      'cooling_law', 'No cooling-off period: Western Australian law doesn''t give one for a dealer''s sale.',
      'warranty_hint', 'Western Australian duty to repair: a cash price of $4,000 or more ($3,500 for a motorcycle), no more than 12 years old and 180,000 km (motorcycles 8 years and 80,000 km): 3 months or 5,000 km up to 10 years and 150,000 km, otherwise 1 month or 1,500 km.',
      'staff_note', 'The consultant must hold a salesperson''s licence (section 31B).')
    when 'ACT' then jsonb_build_object('allowed', v_on, 'cooling_days', 4,
      'forms', '["The notice for the vehicle (Sale of Motor Vehicles Act 1977, section 20), endorsed and signed for the sale (section 21)"]'::jsonb,
      'why', case when v_on then null else 'ACT: selling after the auction is switched off in Admin settings.' end,
      'cooling_law', 'ACT law gives a buyer from a dealer 3 clear business days to change their mind. We give every buyer until the end of the fourth business day after they sign, and cancelling is free.',
      'warranty_hint', 'ACT duty to repair: the vehicles in Schedule 1 of the Act (generally under 10 years old and 160,000 km: 3 months or 5,000 km). Not commercial vehicles.')
    when 'TAS' then jsonb_build_object('allowed', v_on, 'cooling_days', 0,
      'forms', '["The pre-sale disclosure statement (Motor Vehicle Traders Act 2011, section 37)", "The contract of sale, with the statutory warranty (section 34)"]'::jsonb,
      'why', case when v_on then null else 'Tasmania: auctioning for owners needs no licence, but selling after the auction is dealing, which needs a motor vehicle trader licence (Motor Vehicle Traders Act 2011, sections 4 and 6). Add Tasmania in Admin settings once it''s held.' end,
      'cooling_law', 'No cooling-off period: Tasmanian law doesn''t give one.',
      'warranty_hint', 'Tasmanian statutory warranty: a vehicle that isn''t commercial, under 120,000 km, with a compliance plate under 7 years old: 3 months or 3,000 km.')
    when 'NT' then jsonb_build_object('allowed', v_on, 'cooling_days', 0,
      'forms', '["The contract of sale (Consumer Affairs and Fair Trading Act, section 160), in duplicate"]'::jsonb,
      'why', case when v_on then null else 'Northern Territory: selling to the public needs a motor vehicle dealer licence. Add the NT in Admin settings once it''s held.' end,
      'cooling_law', 'No cooling-off period: Northern Territory law doesn''t give one.',
      'warranty_hint', 'Northern Territory statutory warranty: a car under 10 years old and 160,000 km: 3 months or 5,000 km.')
    else jsonb_build_object('allowed', false, 'cooling_days', 0, 'forms', '[]'::jsonb, 'why', 'Record the vehicle''s state first.')
  end;
end $$;
revoke execute on function public.after_auction_rule(text) from public, anon;
grant execute on function public.after_auction_rule(text) to authenticated, service_role;

-- The end of the p_days-th business day after the day of p_from (weekdays that aren't a public holiday), in p_tz.
create or replace function public.cooling_off_end(p_from timestamptz, p_days int, p_tz text) returns timestamptz
language plpgsql stable set search_path = public as $$
declare d date; n int := coalesce(p_days, 0);
begin
  if n <= 0 then return null; end if;
  d := (p_from at time zone p_tz)::date;
  while n > 0 loop
    d := d + 1;
    if extract(isodow from d) < 6 and not exists (select 1 from public_holidays where day = d) then n := n - 1; end if;
  end loop;
  return ((d + 1)::timestamp at time zone p_tz) - interval '1 second';
end $$;
revoke execute on function public.cooling_off_end(timestamptz, int, text) from public, anon;
grant execute on function public.cooling_off_end(timestamptz, int, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
alter table public.second_chance_offers
  add column if not exists kind text not null default 'next_bidder',
  add column if not exists state text,
  add column if not exists rule jsonb,
  add column if not exists warranty boolean,
  add column if not exists warranty_text text,
  add column if not exists docs jsonb not null default '[]'::jsonb,
  add column if not exists decision_id uuid references public.seller_decisions(id) on delete set null,
  add column if not exists consultant text,
  add column if not exists signed_name text,
  add column if not exists accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists cooling_off_until timestamptz,
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists cancel_reason text;
alter table public.second_chance_offers drop constraint if exists second_chance_offers_kind_check;
alter table public.second_chance_offers add constraint second_chance_offers_kind_check check (kind in ('next_bidder','after_auction'));
alter table public.second_chance_offers drop constraint if exists second_chance_offers_status_check;
alter table public.second_chance_offers add constraint second_chance_offers_status_check
  check (status in ('pending','cooling_off','accepted','declined','expired','withdrawn','cancelled'));
-- one open deal per vehicle: an offer waiting for an answer, or a sale in its cooling-off period
drop index if exists public.second_chance_one_open;
create unique index second_chance_one_open on public.second_chance_offers (lot_id) where status in ('pending','cooling_off');
create index if not exists second_chance_due on public.second_chance_offers (expires_at) where status = 'pending';
create index if not exists second_chance_cooling on public.second_chance_offers (cooling_off_until) where status = 'cooling_off';
create index if not exists second_chance_invoice on public.second_chance_offers (invoice_id) where invoice_id is not null;

alter table public.lots drop constraint if exists lots_sold_via_check;
alter table public.lots add constraint lots_sold_via_check check (sold_via in ('auction','buy_now','offer','referral','after_auction'));

alter table public.seller_decisions add column if not exists note text;
alter table public.seller_decisions drop constraint if exists seller_decisions_action_check;
alter table public.seller_decisions add constraint seller_decisions_action_check
  check (action in ('accept_referral','decline_referral','accept_offer','decline_offer','lower_reserve','remove_reserve','decline_relist','accept_after','withdraw_after'));
create index if not exists seller_decisions_after on public.seller_decisions (lot_id, created_at desc) where action in ('accept_after','withdraw_after');

-- The state's forms for each offer, filled in by staff: private, read only through the server (no storage policies).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('after-sale-docs', 'after-sale-docs', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Can it be sold after the auction now?
-- ---------------------------------------------------------------------------
create or replace function public.after_auction_check(p_lot bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l lots%rowtype; v_state text; v_rule jsonb; v_end timestamptz; v_rid bigint; v_rstatus text; v_code text; v_why text; v_req boolean;
begin
  select * into l from lots where id = p_lot;
  if not found then return jsonb_build_object('ok', false, 'code', 'lot_not_found', 'why', 'We couldn''t find that vehicle.'); end if;
  -- the vehicle's state is where it's consigned and collected; one located or registered in Victoria is Victorian
  v_state := case when upper(coalesce(l.rego_state, '')) = 'VIC' then 'VIC' else upper(coalesce(nullif(trim(l.state), ''), l.rego_state, '')) end;
  v_rule := after_auction_rule(v_state);
  select max(signed_at) + interval '90 days' into v_end from seller_agreements where lot_id = p_lot and status = 'signed';
  select id, status into v_rid, v_rstatus from lots where relisted_from = p_lot and status <> 'cancelled' order by created_at desc limit 1;
  select coalesce((value->>'require_checks')::boolean, true) into v_req from settings where key = 'selling';
  if not live_only() then
    v_code := 'live_only_off'; v_why := 'Selling after the auction is for live auctions.';
  elsif l.status <> 'passed' then
    v_code := 'not_passed'; v_why := 'Only a vehicle that was passed in, or whose buyer didn''t pay, can be sold after the auction.';
  elsif exists (select 1 from invoices where lot_id = p_lot and status <> 'cancelled') then
    v_code := 'sold'; v_why := 'It already has a sale.';
  elsif not coalesce((v_rule->>'allowed')::boolean, false) then
    v_code := 'state'; v_why := v_rule->>'why';
  elsif v_rid is not null and v_rstatus <> 'draft' then
    v_code := 'relisted'; v_why := 'It''s already listed for the next auction (lot ' || v_rid || '), so it can only be sold there.';
  elsif coalesce(v_req, true) and (l.seller_id is null or v_end is null) then
    v_code := 'no_agreement'; v_why := 'There''s no signed seller agreement on it, so we have no authority to sell it.';
  elsif v_end is not null and v_end <= now() then
    v_code := 'authority'; v_why := 'The seller''s authority to sell ended on ' || to_char(v_end at time zone 'Australia/Brisbane', 'FMDD Mon YYYY')
      || ' (90 days after they signed). They sign the agreement again first.';
  end if;
  return jsonb_build_object('ok', v_code is null, 'code', v_code, 'why', v_why, 'state', v_state, 'rule', v_rule,
    'authority_ends', v_end, 'relist_id', v_rid, 'relist_status', v_rstatus);
end $$;
revoke execute on function public.after_auction_check(bigint) from public, anon, authenticated;
grant execute on function public.after_auction_check(bigint) to service_role;

-- How many people it could be offered to after the auction: members who bid on it (early bids included) or watched it,
-- never its seller, a suspended account, or a buyer whose purchase of it was cancelled (admin_after_offer's rules).
create or replace function public.after_interested(p_lot bigint) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct x.u)::int from (
      select bidder_id u from bids where lot_id = p_lot
      union select bidder_id from max_bids where lot_id = p_lot
      union select user_id from watchlist where lot_id = p_lot) x
    join profiles p on p.id = x.u
   where x.u is distinct from (select seller_id from lots where id = p_lot) and not coalesce(p.suspended, false)
     and not exists (select 1 from invoices i where i.lot_id = p_lot and i.buyer_id = x.u and i.status = 'cancelled')
$$;
revoke execute on function public.after_interested(bigint) from public, anon, authenticated;
grant execute on function public.after_interested(bigint) to service_role;

-- The price the seller has agreed to in writing (the latest answer), or null.
create or replace function public.after_seller_price(p_lot bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select case when action = 'accept_after' then amount end from seller_decisions
   where lot_id = p_lot and action in ('accept_after','withdraw_after') order by created_at desc limit 1
$$;
revoke execute on function public.after_seller_price(bigint) from public, anon, authenticated;
grant execute on function public.after_seller_price(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The seller's written agreement to a price (from the dashboard, or in writing to the consultant)
-- ---------------------------------------------------------------------------
create or replace function public.after_seller_agree_core(p_lot bigint, p_amount numeric, p_via text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare l lots%rowtype; v jsonb; v_id uuid; o record;
begin
  select * into l from lots where id = p_lot for update;
  if not found then raise exception 'lot_not_found'; end if;
  v := after_auction_check(p_lot);
  if not (v->>'ok')::boolean then raise exception 'after_closed:%', v->>'why'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000000 or p_amount <> round(p_amount) then
    raise exception 'amount_needed:enter the price in whole dollars';
  end if;
  if exists (select 1 from second_chance_offers where lot_id = p_lot and status = 'cooling_off') then
    raise exception 'after_agreed:a buyer has already agreed to buy it';
  end if;
  insert into seller_decisions (lot_id, seller_id, action, amount, via, note)
    values (p_lot, l.seller_id, 'accept_after', p_amount, p_via, nullif(trim(coalesce(p_note, '')), '')) returning id into v_id;
  -- a higher price than an offer already out: that offer no longer has the seller's agreement
  for o in select id, user_id from second_chance_offers where lot_id = p_lot and kind = 'after_auction' and status = 'pending' and amount < p_amount loop
    update second_chance_offers set status = 'withdrawn', decided_at = now(), cancel_reason = 'The seller changed their price' where id = o.id;
    perform queue_notice(o.user_id, 'account', 'The offer for the ' || l.title || ' has been withdrawn',
      'The seller has changed what they''ll accept, so this offer is withdrawn and you don''t owe anything. Our consultant may be in touch with a new one.',
      '/offers/' || o.id, 'after-withdrawn:' || o.id);
  end loop;
  perform queue_staff_email(p_lot, 'The seller will sell the ' || l.title || ' for $' || to_char(p_amount, 'FM999,999,990'),
    'The seller of lot ' || p_lot || ' (' || l.title || ') has agreed in writing to sell it after the auction for $' || to_char(p_amount, 'FM999,999,990') || ' or more'
    || case when p_via = 'admin' then ' (recorded by staff: ' || coalesce(nullif(trim(p_note), ''), 'no note') || ').' else ', from their seller dashboard.' end
    || case when l.bid_count > 0 then ' The highest bid was $' || to_char(l.current_bid, 'FM999,999,990') || '.' else '' end
    || ' Send the offer from the lot page.', '/admin/lots/' || p_lot, 'after-agreed:' || v_id);
  if p_via = 'admin' then
    -- the written confirmation of an instruction given to the consultant
    perform queue_seller_notice(p_lot, 'You''ll sell your ' || l.title || ' for $' || to_char(p_amount, 'FM999,999,990'),
      'You told us you''ll sell it after the auction for $' || to_char(p_amount, 'FM999,999,990') || ' or more, so we''ll offer it to a bidder at that price. '
      || 'If that isn''t right, tell us straight away, or change it on your seller dashboard.', '/sell/dashboard', 'after-agreed-seller:' || v_id);
  end if;
  return v_id;
end $$;
revoke execute on function public.after_seller_agree_core(bigint, numeric, text, text) from public, anon, authenticated;
grant execute on function public.after_seller_agree_core(bigint, numeric, text, text) to service_role;

create or replace function public.seller_accept_after(p_lot bigint, p_amount numeric) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from lots where id = p_lot and seller_id = (select auth.uid())) then raise exception 'forbidden'; end if;
  return after_seller_agree_core(p_lot, p_amount, 'portal', null);
end $$;
revoke execute on function public.seller_accept_after(bigint, numeric) from public, anon;
grant execute on function public.seller_accept_after(bigint, numeric) to authenticated, service_role;

create or replace function public.admin_seller_agreed(p_lot bigint, p_amount numeric, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'note_needed:say how the seller confirmed it in writing (for example, their email of 26 October, 10:15 am)';
  end if;
  return after_seller_agree_core(p_lot, p_amount, 'admin', p_note);
end $$;
revoke execute on function public.admin_seller_agreed(bigint, numeric, text) from public, anon;
grant execute on function public.admin_seller_agreed(bigint, numeric, text) to authenticated, service_role;

-- The seller changes their mind, until a buyer accepts: any offer still waiting for an answer is withdrawn.
create or replace function public.seller_withdraw_after(p_lot bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare l lots%rowtype; v_id uuid; o record;
begin
  if (select auth.uid()) is null then raise exception 'not_signed_in'; end if;
  select * into l from lots where id = p_lot for update;
  if not found or l.seller_id is distinct from (select auth.uid()) then raise exception 'forbidden'; end if;
  if exists (select 1 from second_chance_offers where lot_id = p_lot and status = 'cooling_off')
     or exists (select 1 from second_chance_offers where lot_id = p_lot and kind = 'after_auction' and status = 'accepted') then
    raise exception 'after_agreed:a buyer has already agreed to buy it. Call us';
  end if;
  if after_seller_price(p_lot) is null then raise exception 'after_closed:you haven''t agreed a price'; end if;
  insert into seller_decisions (lot_id, seller_id, action, via) values (p_lot, l.seller_id, 'withdraw_after', 'portal') returning id into v_id;
  for o in select id, user_id from second_chance_offers where lot_id = p_lot and kind = 'after_auction' and status = 'pending' loop
    update second_chance_offers set status = 'withdrawn', decided_at = now(), cancel_reason = 'The seller changed their mind' where id = o.id;
    perform queue_notice(o.user_id, 'account', 'The offer for the ' || l.title || ' has been withdrawn',
      'The seller has decided not to sell it after the auction, so this offer is withdrawn and you don''t owe anything. If it''s offered at a later auction, we''ll let you know.',
      '/offers/' || o.id, 'after-withdrawn:' || o.id);
  end loop;
  perform queue_staff_email(p_lot, 'The seller won''t sell the ' || l.title || ' after the auction',
    'The seller of lot ' || p_lot || ' has withdrawn the price they agreed, from their seller dashboard. Any offer still waiting for an answer has been withdrawn.',
    '/admin/lots/' || p_lot, 'after-seller-withdrew:' || v_id);
  return v_id;
end $$;
revoke execute on function public.seller_withdraw_after(bigint) from public, anon;
grant execute on function public.seller_withdraw_after(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The offer, and the buyer's answer
-- ---------------------------------------------------------------------------
create or replace function public.admin_after_offer(p_lot bigint, p_user uuid, p_amount numeric, p_hours int, p_warranty boolean,
  p_warranty_text text, p_docs jsonb, p_consultant text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l lots%rowtype; v jsonb; v_rule jsonb; v_price numeric; v_dec uuid; v_exp timestamptz; v_id uuid; v_total numeric;
  v_docs jsonb := coalesce(p_docs, '[]'::jsonb); v_forms int; v_name text;
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  select * into l from lots where id = p_lot for update;
  if not found then raise exception 'lot_not_found'; end if;
  v := after_auction_check(p_lot);
  if not (v->>'ok')::boolean then raise exception 'after_closed:%', v->>'why'; end if;
  v_rule := v->'rule';
  update second_chance_offers set status = 'expired', decided_at = now() where lot_id = p_lot and status = 'pending' and expires_at <= now();
  if exists (select 1 from second_chance_offers where lot_id = p_lot and status in ('pending','cooling_off')) then
    raise exception 'offer_open:there''s already an open offer on this vehicle. Withdraw it, or wait for the answer';
  end if;
  select id, amount into v_dec, v_price from seller_decisions where lot_id = p_lot and action in ('accept_after','withdraw_after') order by created_at desc limit 1;
  if v_price is null or not exists (select 1 from seller_decisions where id = v_dec and action = 'accept_after') then
    raise exception 'seller_not_agreed:the seller hasn''t agreed a price in writing. Ask them to accept on their seller dashboard, or record their written agreement';
  end if;
  if p_amount is null or p_amount <> round(p_amount) or p_amount < 1 or p_amount > 10000000 then raise exception 'amount_needed:enter the price in whole dollars'; end if;
  if p_amount < v_price then
    raise exception 'below_seller_price:the seller agreed to sell for $% or more', to_char(v_price, 'FM999,999,990');
  end if;
  if p_user is null or not exists (select 1 from profiles where id = p_user) then raise exception 'member_not_found'; end if;
  if p_user = l.seller_id then raise exception 'own_vehicle'; end if;
  if exists (select 1 from profiles where id = p_user and suspended) then raise exception 'account_suspended'; end if;
  if not exists (select 1 from bids where lot_id = p_lot and bidder_id = p_user)
     and not exists (select 1 from max_bids where lot_id = p_lot and bidder_id = p_user)
     and not exists (select 1 from watchlist where lot_id = p_lot and user_id = p_user) then
    raise exception 'not_interested:offer it to someone who bid on it or is watching it';
  end if;
  if exists (select 1 from invoices where lot_id = p_lot and buyer_id = p_user and status = 'cancelled') then
    raise exception 'buyer_defaulted:their purchase of this vehicle was cancelled, so it can''t be offered to them again';
  end if;
  if p_warranty is null then raise exception 'warranty_needed:say whether a statutory warranty applies to this sale'; end if;
  if p_warranty and char_length(trim(coalesce(p_warranty_text, ''))) < 10 then
    raise exception 'warranty_needed:describe the warranty (for example: dealer guarantee, 3 months or 5,000 km, whichever comes first)';
  end if;
  v_name := trim(coalesce(p_consultant, ''));
  if char_length(v_name) < 3 then raise exception 'consultant_needed:say who is signing the offer for us'; end if;
  -- the state's forms, uploaded for this vehicle
  if jsonb_typeof(v_docs) <> 'array' then raise exception 'bad_docs:the documents must be a list'; end if;
  if jsonb_array_length(v_docs) > 10 or exists (
       select 1 from jsonb_array_elements(v_docs) d
        where jsonb_typeof(d) <> 'object' or coalesce(d->>'path', '') !~ ('^' || p_lot || '/[0-9a-f-]{36}\.(pdf|jpg|png)$')
           or char_length(trim(coalesce(d->>'name', ''))) not between 2 and 160) then
    raise exception 'bad_docs:the documents must be PDFs or photos uploaded for this vehicle';
  end if;
  v_forms := coalesce(jsonb_array_length(v_rule->'forms'), 0);
  if jsonb_array_length(v_docs) < v_forms then
    raise exception 'forms_needed:attach the state''s paperwork (%)', (select string_agg(x, '; ') from jsonb_array_elements_text(v_rule->'forms') x);
  end if;
  v_exp := now() + make_interval(hours => greatest(4, least(coalesce(p_hours, 24), 72)));
  begin
    insert into second_chance_offers (lot_id, user_id, amount, expires_at, created_by, kind, state, rule, warranty, warranty_text, docs, decision_id, consultant)
    values (p_lot, p_user, p_amount, v_exp, auth.uid(), 'after_auction', v->>'state', v_rule, p_warranty,
      case when p_warranty then trim(p_warranty_text) end, v_docs, v_dec, v_name)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'offer_open:there''s already an open offer on this vehicle';
  end;
  v_total := (lot_price_breakdown(p_lot, p_amount)->>'total')::numeric;
  perform queue_notice(p_user, 'account', 'An offer for you: the ' || l.title,
    'The seller has agreed to sell you the ' || l.title || ' for $' || to_char(p_amount, 'FM999,999,990')
    || ' ($' || to_char(v_total, 'FM999,999,990.00') || ' all-in with fees), after the auction. It''s open until '
    || to_char(v_exp at time zone 'Australia/Brisbane', 'FMDy DD Mon, FMHH12:MI am') || ' (Brisbane time). Read it, with the paperwork, and accept or decline on the offer page. There''s no obligation.',
    '/offers/' || v_id, 'after-offer:' || v_id);
  return jsonb_build_object('id', v_id, 'amount', p_amount, 'total', v_total, 'expires_at', v_exp);
end $$;
revoke execute on function public.admin_after_offer(bigint, uuid, numeric, int, boolean, text, jsonb, text) from public, anon;
grant execute on function public.admin_after_offer(bigint, uuid, numeric, int, boolean, text, jsonb, text) to authenticated, service_role;

create or replace function public.admin_after_withdraw(p_offer uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o second_chance_offers%rowtype; v_title text;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into o from second_chance_offers where id = p_offer for update;
  if not found or o.kind <> 'after_auction' then raise exception 'offer_not_found'; end if;
  if o.status = 'cooling_off' then
    raise exception 'after_agreed:the buyer has accepted. Only they can cancel in their cooling-off period; otherwise cancel the sale';
  end if;
  if o.status <> 'pending' then raise exception 'offer_closed:this offer has already been answered'; end if;
  update second_chance_offers set status = 'withdrawn', decided_at = now(), cancel_reason = nullif(trim(coalesce(p_reason, '')), '') where id = p_offer;
  select title into v_title from lots where id = o.lot_id;
  perform queue_notice(o.user_id, 'account', 'The offer for the ' || v_title || ' has been withdrawn',
    'We''ve withdrawn this offer, so you don''t owe anything.' || coalesce(' ' || nullif(trim(coalesce(p_reason, '')), ''), ''),
    '/offers/' || p_offer, 'after-withdrawn:' || p_offer);
  return p_offer;
end $$;
revoke execute on function public.admin_after_withdraw(uuid, text) from public, anon;
grant execute on function public.admin_after_withdraw(uuid, text) to authenticated, service_role;

-- The buyer answers. Accepting is signing: they type their name as it is on their verified account. Where the state has
-- a cooling-off period the deal waits for it to end (nothing is invoiced or taken meanwhile); otherwise it's sold now.
create or replace function public.respond_after_offer(p_offer uuid, p_accept boolean, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); o second_chance_offers%rowtype; l lots%rowtype; v jsonb; v_until timestamptz; v_inv uuid;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'); p profiles%rowtype; v_when text;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  select * into o from second_chance_offers where id = p_offer for update;
  if not found or o.user_id <> v_user or o.kind <> 'after_auction' then raise exception 'offer_not_found'; end if;
  if o.status <> 'pending' then raise exception 'offer_closed:this offer has already been answered'; end if;
  if o.expires_at <= now() then
    update second_chance_offers set status = 'expired', decided_at = now() where id = p_offer;
    raise exception 'offer_expired:this offer has expired';
  end if;
  select * into l from lots where id = o.lot_id;
  if not p_accept then
    update second_chance_offers set status = 'declined', decided_at = now() where id = p_offer;
    perform queue_staff_email(o.lot_id, 'Declined: the offer for the ' || l.title,
      'The buyer declined the offer of $' || to_char(o.amount, 'FM999,999,990') || ' for lot ' || o.lot_id || '. You can offer it to someone else, or it goes into the next auction.',
      '/admin/lots/' || o.lot_id, 'after-declined:' || p_offer);
    return jsonb_build_object('status', 'declined');
  end if;
  select * into p from profiles where id = v_user;
  if char_length(v_name) < 3 then raise exception 'sign_name:type your full name to sign'; end if;
  if lower(v_name) <> lower(regexp_replace(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '\s+', ' ', 'g')) then
    raise exception 'sign_name:type your name as it is on your account: %', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''));
  end if;
  perform bid_gate(v_user);
  perform bid_guard(o.lot_id, v_user);
  select * into l from lots where id = o.lot_id for update;
  v := after_auction_check(o.lot_id);
  if not (v->>'ok')::boolean then raise exception 'offer_closed:%', v->>'why'; end if;
  if after_seller_price(o.lot_id) is null or after_seller_price(o.lot_id) > o.amount then
    raise exception 'offer_closed:the seller has withdrawn their agreement to this price';
  end if;
  perform deposit_check(v_user, o.lot_id, o.amount);
  v_until := cooling_off_end(now(), coalesce((o.rule->>'cooling_days')::int, 0), coalesce(o.rule->>'tz', 'Australia/Brisbane'));
  update second_chance_offers set signed_name = v_name, accepted_at = now(), decided_at = now(), terms_version = p.terms_version,
    cooling_off_until = v_until, status = case when v_until is null then 'accepted' else 'cooling_off' end
  where id = p_offer;
  if v_until is null then
    v_inv := after_sale_complete(p_offer);
    return jsonb_build_object('status', 'accepted', 'invoice_id', v_inv);
  end if;
  v_when := to_char(v_until at time zone (o.rule->>'tz'), 'FMDay FMDD FMMonth, FMHH12:MI am') || ' (' || coalesce(o.state, '') || ' time)';
  perform queue_notice(v_user, 'account', 'Agreed: the ' || l.title || ' for $' || to_char(o.amount, 'FM999,999,990'),
    'You''ve signed to buy it. You can change your mind until ' || v_when || ': cancel on the offer page, free. After that the sale is final and your invoice is ready to pay. We don''t take any money before then.',
    '/offers/' || p_offer, 'after-agreed-buyer:' || p_offer);
  perform queue_seller_notice(o.lot_id, 'A buyer has agreed to buy your ' || l.title,
    'A buyer has signed to buy it for $' || to_char(o.amount, 'FM999,999,990') || '. The law gives them until ' || v_when
    || ' to change their mind, so it isn''t final yet. We''ll tell you as soon as it is.', '/sell/dashboard', 'after-agreed-seller-buyer:' || p_offer);
  perform queue_staff_email(o.lot_id, 'Agreed, in cooling-off: the ' || l.title,
    'The buyer signed the offer of $' || to_char(o.amount, 'FM999,999,990') || ' for lot ' || o.lot_id || '. Their cooling-off period runs until ' || v_when
    || '. If they don''t cancel, the sale becomes final then and the invoice goes out.', '/admin/lots/' || o.lot_id, 'after-cooling:' || p_offer);
  return jsonb_build_object('status', 'cooling_off', 'cooling_off_until', v_until);
end $$;
revoke execute on function public.respond_after_offer(uuid, boolean, text) from public, anon;
grant execute on function public.respond_after_offer(uuid, boolean, text) to authenticated, service_role;

-- The buyer changes their mind in their cooling-off period: free, and nothing was taken.
create or replace function public.cancel_after_offer(p_offer uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); o second_chance_offers%rowtype; v_title text;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  select * into o from second_chance_offers where id = p_offer for update;
  if not found or o.user_id <> v_user or o.kind <> 'after_auction' then raise exception 'offer_not_found'; end if;
  if o.status <> 'cooling_off' then raise exception 'offer_closed:there''s no cooling-off period running on this offer'; end if;
  if o.cooling_off_until <= now() then raise exception 'cooling_over:the cooling-off period has ended, so the sale is final'; end if;
  update second_chance_offers set status = 'cancelled', decided_at = now(), cancel_reason = 'cooling_off' where id = p_offer;
  select title into v_title from lots where id = o.lot_id;
  perform queue_notice(v_user, 'account', 'Cancelled: the ' || v_title,
    'You''ve used your cooling-off period, so the purchase is cancelled. Nothing is payable.', '/offers/' || p_offer, 'after-cancelled:' || p_offer);
  perform queue_seller_notice(o.lot_id, 'The buyer changed their mind about your ' || v_title,
    'The buyer used their cooling-off period, so the sale didn''t go ahead. Unless you tell us otherwise, it goes into the next auction as planned.',
    '/sell/dashboard', 'after-cancelled-seller:' || p_offer);
  perform queue_staff_email(o.lot_id, 'Cancelled in cooling-off: the ' || v_title,
    'The buyer used their cooling-off period on lot ' || o.lot_id || '. You can offer it to someone else, or it goes into the next auction.',
    '/admin/lots/' || o.lot_id, 'after-cancelled-staff:' || p_offer);
  return o.lot_id;
end $$;
revoke execute on function public.cancel_after_offer(uuid) from public, anon;
grant execute on function public.cancel_after_offer(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. The sale: made when the buyer signs (no cooling-off) or when their cooling-off period ends
-- ---------------------------------------------------------------------------
create or replace function public.after_sale_complete(p_offer uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o second_chance_offers%rowtype; l lots%rowtype; v_inv uuid; v_relist bigint;
begin
  select * into o from second_chance_offers where id = p_offer for update;
  if not found or o.kind <> 'after_auction' then raise exception 'offer_not_found'; end if;
  if o.invoice_id is not null then return o.invoice_id; end if;
  if o.status not in ('cooling_off', 'accepted') then return null; end if;
  select * into l from lots where id = o.lot_id for update;
  if l.status <> 'passed' or exists (select 1 from invoices where lot_id = o.lot_id and status <> 'cancelled') then
    update second_chance_offers set status = 'cancelled', decided_at = now(), cancel_reason = 'no longer available' where id = p_offer;
    perform queue_notice(o.user_id, 'account', 'The ' || l.title || ' is no longer available',
      'We''re sorry: it can''t be sold to you after all, so nothing is payable.', '/offers/' || p_offer, 'after-unavailable:' || p_offer);
    return null;
  end if;
  update lots set status = 'sold', winner_id = o.user_id, sold_price = o.amount, sold_via = 'after_auction', updated_at = now() where id = o.lot_id;
  v_inv := create_invoice(o.lot_id, o.user_id, o.amount, 'after_auction');
  update second_chance_offers set status = 'accepted', invoice_id = v_inv where id = p_offer;
  -- the relist made at the pass-in isn't needed any more
  update lots set status = 'cancelled', updated_at = now() where relisted_from = o.lot_id and status = 'draft' returning id into v_relist;
  perform queue_staff_email(o.lot_id, 'Sold after the auction: the ' || l.title || ' for $' || to_char(o.amount, 'FM999,999,990'),
    'Lot ' || o.lot_id || ' is sold after the auction for $' || to_char(o.amount, 'FM999,999,990') || ' (signed by ' || coalesce(o.signed_name, 'the buyer') || '). The invoice has gone to the buyer.'
    || case when v_relist is not null then ' Its relist draft, lot ' || v_relist || ', has been cancelled.' else '' end
    || case when o.warranty then ' A statutory warranty applies: ' || coalesce(o.warranty_text, '') else '' end,
    '/admin/lots/' || o.lot_id, 'after-sold:' || p_offer);
  -- the seller and the other bidders hear from queue_status_notices (the vehicle is now sold)
  return v_inv;
end $$;
revoke execute on function public.after_sale_complete(uuid) from public, anon, authenticated;
grant execute on function public.after_sale_complete(uuid) to service_role;

-- The clock: offers nobody answered in time expire; cooling-off periods that have ended make the sale.
create or replace function public.finish_after_offers(p_limit int default 100) returns int
language plpgsql security definer set search_path = public as $$
declare o record; n int := 0;
begin
  for o in select x.id, x.lot_id, x.kind, x.amount, l.title from second_chance_offers x join lots l on l.id = x.lot_id
            where x.status = 'pending' and x.expires_at <= now() order by x.expires_at limit p_limit for update of x skip locked loop
    update second_chance_offers set status = 'expired', decided_at = now() where id = o.id;
    if o.kind = 'after_auction' then
      perform queue_staff_email(o.lot_id, 'No answer: the offer for the ' || o.title,
        'The offer of $' || to_char(o.amount, 'FM999,999,990') || ' for lot ' || o.lot_id || ' expired without an answer. You can offer it to someone else, or it goes into the next auction.',
        '/admin/lots/' || o.lot_id, 'after-expired:' || o.id);
    end if;
    n := n + 1;
  end loop;
  for o in select id from second_chance_offers where status = 'cooling_off' and cooling_off_until <= now()
            order by cooling_off_until limit p_limit for update skip locked loop
    perform after_sale_complete(o.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.finish_after_offers(int) from public, anon, authenticated;
grant execute on function public.finish_after_offers(int) to service_role;

-- With bidding deposits on, a deal in its cooling-off period holds the deposit for its price, like a leading bid.
create or replace function public.deposit_committed(p_user uuid, p_except bigint default null) returns numeric
language sql stable security definer set search_path = public as $$
  with f as (select coalesce((select value from settings where key = 'fees'), '{}'::jsonb) v)
  select coalesce((select sum(deposit_for_with(case when l.status = 'live' then greatest(coalesce(p.leader_max, 0), l.current_bid) else l.current_bid end, f.v))
                     from lots l left join lot_private p on p.lot_id = l.id
                    where l.leader_id = p_user and l.status in ('live','referred') and l.id is distinct from p_except), 0)
       + coalesce((select sum(deposit_for_with(o.amount, f.v)) from offers o join lots l on l.id = o.lot_id
                    where o.user_id = p_user and o.status = 'pending' and l.status in ('offers','referred') and o.lot_id is distinct from p_except), 0)
       + coalesce((select sum(deposit_for_with(m.max_amount, f.v)) from max_bids m join lots l on l.id = m.lot_id
                    where m.bidder_id = p_user and l.method = 'tender' and l.status = 'live' and l.leader_id is null
                      and l.id is distinct from p_except), 0)
       + coalesce((select sum(deposit_for_with(o.amount, f.v)) from second_chance_offers o
                    where o.user_id = p_user and o.kind = 'after_auction' and o.status = 'cooling_off' and o.lot_id is distinct from p_except), 0)
  from f
$$;
revoke execute on function public.deposit_committed(uuid, bigint) from public, anon, authenticated;
grant execute on function public.deposit_committed(uuid, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Notices and the relist
-- ---------------------------------------------------------------------------
-- What the seller can do now, for their pass-in notice (blank where it can't be sold after the auction, or there's
-- nobody to offer it to).
create or replace function public.after_seller_text(p_lot bigint) returns text
language plpgsql stable security definer set search_path = public as $$
declare l lots%rowtype; v jsonb;
begin
  select * into l from lots where id = p_lot;
  if not found then return ''; end if;
  v := after_auction_check(p_lot);
  if not coalesce((v->>'ok')::boolean, false) or after_interested(p_lot) = 0 then return ''; end if;
  return case when l.bid_count > 0 and l.leader_id is not null
    then ' You can also sell it before then: accept the highest ' || case when l.not_offered then 'early ' else '' end || 'bid ($'
         || to_char(l.current_bid, 'FM999,999,990') || ') on your seller dashboard, or tell us the lowest price you''d take, and we''ll offer it to the bidder.'
    else ' You can also sell it before then: tell us on your seller dashboard the lowest price you''d take, and we''ll offer it to the people who watched it.' end;
end $$;
revoke execute on function public.after_seller_text(bigint) from public, anon, authenticated;
grant execute on function public.after_seller_text(bigint) to service_role;

-- migration 25's, with the after-auction choice in the seller's notice
create or replace function public.queue_status_notices(p_limit int default 200) returns int
language plpgsql security definer set search_path = public as $$
declare l record; n int := 0; v_users uuid[]; v_when text; v_plan jsonb;
begin
  for l in select * from lots where status in ('referred','offers','sold','passed') and notified_status is distinct from status
           order by id limit p_limit for update skip locked loop
    v_when := to_char(l.decision_by at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth, FMHH12:MI am');
    if l.status = 'referred' and l.leader_id is not null then
      perform queue_notice(l.leader_id, 'account', 'Your bid on the ' || l.title || ' is with the seller',
        'Bidding ended below the reserve. Your bid of $' || to_char(l.current_bid, 'FM999,999,990') ||
        ' has gone to the seller, who has until ' || v_when || ' (Brisbane time) to accept. Your bid stays binding until then.',
        '/lot/' || l.id, 'referred:' || l.id);
      perform queue_seller_notice(l.id, 'Decision needed: $' || to_char(l.current_bid, 'FM999,999,990') || ' for your ' || l.title,
        'Bidding ended below your reserve. The highest bid is $' || to_char(l.current_bid, 'FM999,999,990') ||
        '. Accept or decline in your seller dashboard by ' || v_when || ' (Brisbane time). If you don''t respond, it counts as a decline and offers open.',
        '/sell/dashboard', 'seller-referred:' || l.id);
    elsif l.status = 'offers' then
      select array_agg(user_id) into v_users from watchlist where lot_id = l.id;
      if v_users is not null then
        perform queue_notice_many(v_users, 'ending', 'Make an offer on the ' || l.title,
          'The auction closed below the reserve. You can make an offer until ' || v_when || '.', '/lot/' || l.id, 'offers:' || l.id);
      end if;
      perform queue_seller_notice(l.id, 'Offers are open on your ' || l.title,
        'We''ll send you each offer as it arrives. Accept or decline in your seller dashboard.', '/sell/dashboard', 'seller-offers:' || l.id);
    elsif l.status = 'sold' then
      select array_agg(bidder_id) into v_users from max_bids where lot_id = l.id and bidder_id is distinct from l.winner_id;
      if v_users is not null then
        perform queue_notice_many(v_users, 'outbid', 'The ' || l.title || ' has sold',
          'Thanks for bidding. This one went to another bidder for $' || to_char(l.sold_price, 'FM999,999,990') ||
          case when l.sold_via = 'after_auction' then ', after the auction' else '' end || '. Similar vehicles are listed every week.',
          '/auctions?cat=' || l.category, 'lost:' || l.id);
      end if;
      perform queue_seller_notice(l.id, 'Sold: your ' || l.title || ' for $' || to_char(l.sold_price, 'FM999,999,990'),
        case when l.sold_via = 'after_auction' then 'It''s sold after the auction, at the price you agreed. ' else 'Congratulations. ' end ||
        'The buyer pays us first. Once it''s paid, our transport partner will call you to book the pickup. Never hand it to anyone else or take money from anyone: if someone contacts you about it, tell us.',
        '/sell/dashboard', 'seller-sold:' || l.id);
    elsif l.status = 'passed' and not exists (select 1 from invoices where lot_id = l.id) then
      -- into the next auction first, so the seller hears when (a failure here leaves it for staff to relist by hand)
      begin
        v_plan := relist_auto(l.id);
      exception when others then
        v_plan := null;
      end;
      if l.leader_id is not null and l.bid_count > 0 then
        perform queue_notice(l.leader_id, 'account', 'You were the highest bidder on the ' || l.title,
          'Bidding reached $' || to_char(l.current_bid, 'FM999,999,990') || ', below the seller''s reserve, so it wasn''t sold and you don''t owe anything. '
          || 'One of our consultants will be in touch.', '/lot/' || l.id, 'passed-top:' || l.id);
      end if;
      if live_only() or (l.leader_id is not null and l.bid_count > 0) then perform queue_passed_followup(l.id, 'passed'); end if;
      select array_agg(bidder_id) into v_users from max_bids where lot_id = l.id and bidder_id is distinct from l.leader_id;
      if v_users is not null and l.bid_count > 0 then
        perform queue_notice_many(v_users, 'outbid', 'The ' || l.title || ' was passed in',
          'Bidding didn''t reach the seller''s reserve, so it wasn''t sold and nobody owes anything. If it''s offered again, it''ll be in a later auction: we''ll let you know.',
          '/lot/' || l.id, 'passed:' || l.id);
      end if;
      perform queue_seller_notice(l.id, 'Your ' || l.title || ' didn''t sell this time',
        case when l.bid_count > 0 then 'It was passed in at $' || to_char(l.current_bid, 'FM999,999,990') || ', below your reserve. ' else 'Nobody bid this time. ' end ||
        relist_seller_text(v_plan) || after_seller_text(l.id), '/sell/dashboard', 'seller-passed:' || l.id);
    end if;
    update lots set notified_status = l.status where id = l.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_status_notices(int) from public, anon, authenticated;
grant execute on function public.queue_status_notices(int) to service_role;

create or replace function public.live_pass_unoffered(p_sale bigint) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_users uuid[]; v_plan jsonb;
begin
  for r in select id, title from lots where sale_id = p_sale and status = 'live' and live_state = 'waiting'
           order by sale_order nulls last, id for update loop
    update lots set status = 'passed', live_state = 'closed', ends_at = least(ends_at, now()), not_offered = true,
      notified_status = 'passed', updated_at = now() where id = r.id;
    select array_agg(distinct bidder_id) into v_users from max_bids where lot_id = r.id;
    if v_users is not null then
      perform queue_notice_many(v_users, 'account', 'The ' || r.title || ' wasn''t offered',
        'It wasn''t offered in this auction, so your early bid has lapsed and nobody owes anything. If it''s offered at a later auction, we''ll let you know.',
        '/lot/' || r.id, 'not-offered:' || r.id);
    end if;
    begin
      v_plan := relist_auto(r.id);
    exception when others then
      v_plan := null;
    end;
    perform queue_seller_notice(r.id, 'Your ' || r.title || ' wasn''t offered this time',
      'The auction finished before it was offered, so nothing was sold. ' || relist_seller_text(v_plan) || after_seller_text(r.id),
      '/sell/dashboard', 'seller-not-offered:' || r.id);
    perform queue_passed_followup(r.id, 'not_offered');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.live_pass_unoffered(bigint) from public, anon, authenticated;
grant execute on function public.live_pass_unoffered(bigint) to service_role;

-- migration 25's follow-up for the consultant, with whether it can be sold after the auction in its state
create or replace function public.queue_passed_followup(p_lot bigint, p_why text default 'passed') returns int
language plpgsql security definer set search_path = public as $$
declare l record; b record; v_reserve numeric; v_sale text; v_head text; v_title text; v_body text; d record; v_end timestamptz;
  v_cert text; v_state text; v_relist text; v_top boolean; v_check jsonb; v_after text;
begin
  select * into l from lots where id = p_lot;
  if not found then return 0; end if;
  v_top := p_why = 'passed' and l.leader_id is not null and l.bid_count > 0;
  select reserve_price into v_reserve from lot_private where lot_id = p_lot;
  select title into v_sale from sales where id = l.sale_id;
  v_head := 'Lot ' || coalesce(l.sale_order::text, l.id::text) || coalesce(' in ' || v_sale, '');
  if p_why = 'not_offered' then
    v_title := 'Follow up: the ' || l.title || ' wasn''t offered';
    v_head := v_head || ' wasn''t offered before the auction finished, so it was passed in.';
  elsif l.bid_count > 0 then
    v_title := 'Follow up: the ' || l.title || ' was passed in at $' || to_char(l.current_bid, 'FM999,999,990');
    v_head := v_head || ' was passed in at $' || to_char(l.current_bid, 'FM999,999,990')
      || coalesce(', below the seller''s reserve of $' || to_char(v_reserve, 'FM999,999,990'), '') || '.';
  else
    v_title := 'Follow up: the ' || l.title || ' had no bids';
    v_head := v_head || ' had no bids, so it was passed in.';
  end if;
  v_body := v_head;
  if v_top then
    select first_name, last_name, email, mobile, deposit_ref into b from profiles where id = l.leader_id;
    v_body := v_body || ' The highest bidder was ' || trim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')) || coalesce(' (bidder ' || b.deposit_ref || ')', '')
      || coalesce(', mobile ' || b.mobile, '') || coalesce(', email ' || b.email, '') || '. They''ve been told one of our consultants will be in touch.';
  end if;
  select x.id, x.status, s.title sale_title, s.starts_at into d from lots x left join sales s on s.id = x.sale_id
   where x.relisted_from = p_lot order by x.created_at desc limit 1;
  select max(signed_at) + interval '90 days' into v_end from seller_agreements where lot_id = coalesce(d.id, p_lot) and status = 'signed';
  if d.id is not null and d.status = 'draft' then
    v_relist := ' It''s been relisted as lot ' || d.id || ' (a draft)' ||
      case when d.sale_title is not null
        then ' for ' || d.sale_title || ' on ' || to_char(d.starts_at at time zone 'Australia/Brisbane', 'FMDy FMDD Mon') || '.'
        else ', not yet in an auction: there''s no live auction' || coalesce(' in ' || l.state, '') || ' far enough ahead' ||
             case when v_end is not null then ' and before the seller''s authority ends' else '' end || '. Choose one in the editor.' end;
    v_state := coalesce(l.rego_state, l.state);
    v_cert := case when l.registration = 'registered' then roadworthy_needed(v_state, l.year, l.category, l.gvm_kg) end;
    v_relist := v_relist || ' Before it goes live: agree the reserve with the seller (they can lower it; if they don''t want it offered again, record that on the lot page), '
      || 'set a fresh estimate and write down its grounds, and run a fresh PPSR search and the listing checks.'
      || case when v_cert is null then ''
              when v_cert = 'roadworthy certificate' then ' It''s registered in Victoria: the roadworthy certificate must be issued less than 30 days before the new auction.'
              when v_cert = 'safety certificate' then ' It''s registered in Queensland: the safety certificate must be no more than 2 months old at the new auction.'
              else ' It''s registered in ' || v_state || ': it needs a current ' || v_cert || ' for the transfer.' end
      || case when v_end is not null then ' The seller''s authority to sell ends on ' || to_char(v_end at time zone 'Australia/Brisbane', 'FMDD Mon YYYY')
              || ' (90 days after they signed): the auction must be before then, or they sign again.' else '' end;
  elsif exists (select 1 from seller_decisions where lot_id = p_lot and action = 'decline_relist') then
    v_relist := ' The seller doesn''t want it offered again.';
  else
    v_relist := ' It hasn''t been relisted: relist it from the lot page once you''ve spoken to the seller.';
  end if;
  -- selling it after the auction, where its state allows it
  v_check := after_auction_check(p_lot);
  if coalesce((v_check->>'ok')::boolean, false) then
    v_after := ' It can be sold after the auction until the new listing goes live (' || coalesce(v_check->>'state', '') || ' rules): get the seller''s written agreement to a price '
      || '(they can accept on their seller dashboard), then send the offer from the lot page'
      || case when jsonb_array_length(coalesce(v_check->'rule'->'forms', '[]'::jsonb)) > 0
              then ', with ' || (select string_agg(x, '; ') from jsonb_array_elements_text(v_check->'rule'->'forms') x) else '' end || '.'
      || case when coalesce((v_check->'rule'->>'cooling_days')::int, 0) > 0 then ' The buyer gets a cooling-off period.' else '' end;
  else
    v_after := ' It can''t be sold after the auction: ' || coalesce(v_check->>'why', 'it isn''t available')
      || case when v_top then ' Once the new listing is live, the bidder can leave an early bid on it.' else '' end;
  end if;
  v_body := v_body || v_relist || v_after;
  return queue_staff_email(p_lot, v_title, v_body, '/admin/lots/' || coalesce(case when d.status = 'draft' then d.id end, p_lot), 'passed-followup:' || p_lot);
end $$;
revoke execute on function public.queue_passed_followup(bigint, text) from public, anon, authenticated;
grant execute on function public.queue_passed_followup(bigint, text) to service_role;

-- Migration 22's refusal of the old offer to the next bidder points to the new way.
create or replace function public.admin_offer_next_bidder(p_lot bigint, p_hours int default 24, p_seller_ok boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if live_only() then
    raise exception 'live_only:offer it from "Sell it after the auction" on the lot page instead, where its state allows it';
  end if;
  return admin_offer_next_bidder_core(p_lot, p_hours, p_seller_ok);
end $$;
revoke execute on function public.admin_offer_next_bidder(bigint, int, boolean) from public, anon;
grant execute on function public.admin_offer_next_bidder(bigint, int, boolean) to authenticated, service_role;

-- Publishing: migration 25's checks, plus a relist waits while the vehicle it came from has an offer or a cooling-off
-- period open (one vehicle is never on offer twice).
create or replace function public.lot_publish_check() returns trigger
language plpgsql set search_path = public as $$
declare v_req boolean; v_missing text[]; s public.sales%rowtype; v_basis text; v_cert text; v_day date; v_auth_end timestamptz; v_sale_at timestamptz;
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
begin
  if new.status in ('live','scheduled') and (tg_op = 'INSERT' or old.status = 'draft') then
    if current_user in ('authenticated','service_role','anon') then
      if new.relisted_from is not null and exists (select 1 from public.second_chance_offers
           where lot_id = new.relisted_from and status in ('pending','cooling_off')) then
        raise exception 'not_ready:the last listing (lot %) has an open offer to sell it after the auction. Wait for the answer (or withdraw the offer) before this goes live', new.relisted_from;
      end if;
      if live_only() then
        if new.method is distinct from 'auction' then
          raise exception 'not_ready:every vehicle is sold in a live auction. Change it from a tender to an auction';
        end if;
        if new.buy_now_price is not null then
          raise exception 'not_ready:every vehicle is sold in a live auction. Remove the Buy Now price';
        end if;
        select * into s from sales where id = new.sale_id;
        if not found or s.mode <> 'live' then
          raise exception 'not_ready:choose the live auction it will be offered in';
        end if;
        if s.live_status = 'ended' then
          raise exception 'not_ready:that live auction has finished. Choose a later one';
        end if;
        if new.estimate_low is null or new.estimate_high is null then
          raise exception 'not_ready:add the auction estimate (low and high)';
        end if;
        select estimate_basis into v_basis from lot_private where lot_id = new.id;
        if char_length(trim(coalesce(v_basis, ''))) < 20 then
          raise exception 'not_ready:write down what the estimate is based on (recent sales of similar vehicles, a price guide). It''s kept on file, not shown';
        end if;
      end if;
      select coalesce((value->>'require_checks')::boolean, true) into v_req from settings where key = 'selling';
      if coalesce(v_req, true) then
        if new.seller_id is null or not exists (select 1 from seller_agreements where lot_id = new.id and seller_id = new.seller_id and status = 'signed') then
          raise exception 'not_ready:the seller hasn''t signed the agency agreement';
        end if;
        -- the agreement is the seller's written authority to sell, for 90 days from signing (seller agreement s 1; in the ACT
        -- a non-trade owner's written authority lapses after 90 days): the auction must fall inside it, relisted or not
        select max(signed_at) + interval '90 days' into v_auth_end from seller_agreements where lot_id = new.id and seller_id = new.seller_id and status = 'signed';
        v_sale_at := coalesce((select starts_at from sales where id = new.sale_id and mode = 'live'), new.ends_at);
        if v_auth_end is not null and v_sale_at is not null and v_sale_at >= v_auth_end then
          raise exception 'not_ready:the seller''s authority to sell ends on % (90 days after they signed), before this auction on %. Ask them to sign the agreement again',
            to_char(v_auth_end at time zone 'Australia/Brisbane', 'FMDD Mon YYYY'), to_char(v_sale_at at time zone 'Australia/Brisbane', 'FMDD Mon YYYY');
        end if;
        if not exists (select 1 from profiles where id = new.seller_id and id_status = 'verified') then
          raise exception 'not_ready:the seller hasn''t verified their ID';
        end if;
        if (select ownership_checked_at from lot_private where lot_id = new.id) is null then
          raise exception 'not_ready:ownership papers haven''t been checked';
        end if;
        if coalesce(new.vin, '') = '' or new.ppsr_checked_at is null then
          raise exception 'not_ready:add the VIN and the PPSR search result';
        end if;
        if new.write_off_status = 'unknown' then
          raise exception 'not_ready:record the written-off check result (from the PPSR search)';
        end if;
        if new.registration is null then
          raise exception 'not_ready:say whether the vehicle is registered or unregistered';
        end if;
        if new.registration = 'registered' and new.write_off_status = 'statutory' then
          raise exception 'not_ready:a statutory write-off can never be registered. List it as unregistered (parts or recycling only)';
        end if;
        if new.registration = 'registered' and (coalesce(new.rego_plate, '') = '' or new.rego_state is null or new.rego_expiry is null) then
          raise exception 'not_ready:add the rego plate, state and expiry date';
        end if;
        if new.registration = 'registered' and new.rego_expiry < current_date then
          raise exception 'not_ready:the registration has expired. Renew it, or list the vehicle as unregistered';
        end if;
        if new.runs is null then
          raise exception 'not_ready:say whether it starts and drives (or that it wasn''t tested)';
        end if;
        if new.depot_id is null or not exists (select 1 from depots where id = new.depot_id and active) then
          raise exception 'not_ready:choose the depot the buyer collects it from';
        end if;
        if new.transport_fee is null then
          raise exception 'not_ready:enter the transport amount (the pickup from the seller to the depot, from the transport quote)';
        end if;
        if coalesce((select seller_address from lot_private where lot_id = new.id), '') = '' then
          raise exception 'not_ready:add the pickup address (where our transport partner collects it)';
        end if;
        if new.statutory_warranty is null then
          raise exception 'not_ready:say whether a statutory warranty applies (it must be stated before bidding opens)';
        end if;
        select array_agg(k) into v_missing from unnest(listing_check_keys()) k where not (k = any(new.verified));
        if v_missing is not null then
          raise exception 'not_ready:tick every listing check against the seller''s photos, video and records (still to do: %)', array_to_string(v_missing, ', ');
        end if;
        if new.stolen_clear is false then
          raise exception 'not_ready:the PPSR shows this vehicle as stolen. Do not list it; contact the police';
        end if;
        -- the certificate the state needs before the registration can be transferred to the buyer
        if new.registration = 'registered' then
          v_cert := roadworthy_needed(coalesce(new.rego_state, new.state), new.year, new.category, new.gvm_kg);
          if v_cert is not null and new.roadworthy_issued_on is null and coalesce(new.roadworthy_note, '') !~* '^\s*exempt' then
            raise exception 'not_ready:a vehicle registered in % needs a current % before the registration can be transferred. Record the date on the seller''s certificate, start the roadworthy note with "Exempt" and say why, or list it as unregistered',
              coalesce(new.rego_state, new.state), v_cert;
          end if;
          if new.roadworthy_issued_on is not null then
            if new.roadworthy_issued_on > v_today then
              raise exception 'not_ready:the certificate date is in the future';
            end if;
            v_day := coalesce((select (starts_at at time zone 'Australia/Brisbane')::date from sales where id = new.sale_id),
                              (new.ends_at at time zone 'Australia/Brisbane')::date, v_today);
            if v_cert = 'roadworthy certificate' and new.roadworthy_issued_on <= v_day - 30 then
              raise exception 'not_ready:a Victorian roadworthy certificate must be issued less than 30 days before the sale (the auction is on %). Ask the seller for a new one',
                to_char(v_day, 'FMDD Mon YYYY');
            end if;
            if v_cert = 'safety certificate' and new.roadworthy_issued_on < (v_day - interval '2 months')::date then
              raise exception 'not_ready:a Queensland safety certificate from a private seller lasts 2 months, so this one won''t be current at the auction on %. Ask the seller for a new one',
                to_char(v_day, 'FMDD Mon YYYY');
            end if;
          end if;
        end if;
      end if;
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 8. What the seller sees about selling after the auction (never who the buyer is)
-- ---------------------------------------------------------------------------
create or replace function public.seller_lot_after(p_lot bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l lots%rowtype; v jsonb; v_def boolean;
begin
  if (select auth.uid()) is null or not exists (select 1 from lots where id = p_lot and seller_id = (select auth.uid())) then raise exception 'forbidden'; end if;
  select * into l from lots where id = p_lot;
  v := after_auction_check(p_lot);
  -- a sale cancelled because the buyer didn't pay: their bid isn't one the seller can accept
  v_def := exists (select 1 from invoices where lot_id = p_lot and status = 'cancelled');
  return jsonb_build_object(
    'open', coalesce((v->>'ok')::boolean, false), 'state', v->>'state', 'why', case when coalesce((v->>'ok')::boolean, false) then null else v->>'why' end,
    'cooling', coalesce((v->'rule'->>'cooling_days')::int, 0) > 0,
    'highest', case when l.bid_count > 0 and not v_def then l.current_bid end, 'not_offered', l.not_offered,
    'defaulted', v_def, 'interested', after_interested(p_lot),
    'price', after_seller_price(p_lot),
    'price_at', (select created_at from seller_decisions where lot_id = p_lot and action in ('accept_after','withdraw_after') order by created_at desc limit 1),
    'price_via', (select via from seller_decisions where lot_id = p_lot and action in ('accept_after','withdraw_after') order by created_at desc limit 1),
    'offer', (select jsonb_build_object('status', status, 'amount', amount, 'expires_at', expires_at, 'cooling_off_until', cooling_off_until)
                from second_chance_offers where lot_id = p_lot and kind = 'after_auction' order by created_at desc limit 1));
end $$;
revoke execute on function public.seller_lot_after(bigint) from public, anon;
grant execute on function public.seller_lot_after(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. The Terms of Sale (selling after the auction, section 6) and the seller agreement (sections 1, 4, 9 and 12) change:
--    members accept the new Terms before they bid again, and new agreements record the new version
-- ---------------------------------------------------------------------------
update public.settings set value = coalesce(value, '{}'::jsonb) || '{"buyer_version": "2026-10-26", "seller_version": "2026-10-26"}'::jsonb where key = 'terms';
