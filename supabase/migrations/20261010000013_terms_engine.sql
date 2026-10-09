-- Make the engine do what the Terms of Sale and the Seller Agency Agreement (version 10 October 2026) say.
--  1. Fees are locked per vehicle when it goes live (lots.fees). A fee change applies only to vehicles listed after it.
--     The seller fee comes from the copy saved when the seller signed.
--  2. The collection window (and storage) starts only once ownership is transferred, never at payment.
--  3. Invoices record when a card charge failed (the buyer then has 1 business day), refunds, and why a sale was cancelled.
--  4. A seller's half of a forfeited deposit or cancellation fee is a payout of its own (seller_payouts.kind 'forfeit').
--  5. Any bid in the closing minutes extends the auction, including a leader raising their maximum to meet the reserve.
--  6. The reserve can be lowered but never raised once there are bids.
--  7. Corrections also cover the title, description, location, plate and damage/flaws, and the wording suits referred
--     and offer periods (bidders can be released before the seller accepts).

-- ---------------------------------------------------------------------------
-- 1. Fees locked per vehicle
-- ---------------------------------------------------------------------------
alter table public.lots add column if not exists fees jsonb;

create or replace function public.lot_fees_snapshot() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'draft' then
    new.fees := null;                       -- a relisted copy starts again from the current fees
  elsif new.status in ('scheduled','live') and new.fees is null then
    select value into new.fees from settings where key = 'fees';
  end if;
  return new;
end $$;
drop trigger if exists lot_fees_snapshot on public.lots;
create trigger lot_fees_snapshot before insert or update of status on public.lots
  for each row execute function public.lot_fees_snapshot();

update public.lots set fees = (select value from public.settings where key = 'fees')
  where fees is null and status in ('scheduled','live','referred','offers');

-- The same sums as before, from any set of fees.
create or replace function public.price_breakdown_with(p_price numeric, f jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_premium numeric := round(p_price * coalesce((f->>'premium_rate')::numeric, 0), 2);
  v_gst numeric := round(v_premium * 0.10, 2);
  v_admin numeric := coalesce((f->>'admin_fee')::numeric, 0);
  v_sub numeric; v_mode text; v_card numeric; v_sur numeric;
begin
  v_sub := p_price + v_premium + v_gst + v_admin;
  if v_sub < coalesce((f->>'card_limit')::numeric, 0) then
    v_mode := 'card'; v_card := v_sub;
  else
    v_mode := 'deposit';
    v_card := case when v_sub < coalesce((f->>'nrd_split')::numeric, 0) then coalesce((f->>'nrd_low')::numeric, 0)
                   else coalesce((f->>'nrd_high')::numeric, 0) end;
  end if;
  v_sur := round(v_card * coalesce((f->>'surcharge_rate')::numeric, 0), 2);
  return jsonb_build_object(
    'price', p_price, 'premium', v_premium, 'gst', v_gst, 'admin_fee', v_admin,
    'subtotal', v_sub, 'mode', v_mode, 'card_base', v_card, 'surcharge', v_sur,
    'card_amount', v_card + v_sur, 'balance_due', v_sub - v_card, 'total', v_sub + v_sur);
end $$;

create or replace function public.price_breakdown(p_price numeric) returns jsonb
language sql stable security definer set search_path = public as $$
  select price_breakdown_with(p_price, coalesce((select value from settings where key = 'fees'), '{}'::jsonb))
$$;

-- The fees locked on this vehicle (any key it doesn't have comes from today's settings).
create or replace function public.lot_price_breakdown(p_lot bigint, p_price numeric) returns jsonb
language sql stable security definer set search_path = public as $$
  select price_breakdown_with(p_price,
    coalesce((select value from settings where key = 'fees'), '{}'::jsonb) || coalesce((select fees from lots where id = p_lot), '{}'::jsonb))
$$;

-- Each invoice records the version of the Terms of Sale the buyer accepted, so the right version applies to that sale.
alter table public.invoices add column if not exists terms_version text;

create or replace function public.create_invoice(p_lot bigint, p_buyer uuid, p_price numeric, p_via text) returns uuid
language plpgsql security definer set search_path = public as $$
declare b jsonb := lot_price_breakdown(p_lot, p_price); v_id uuid; v_gst_status text;
begin
  select gst_status into v_gst_status from lots where id = p_lot;
  insert into invoices (lot_id, buyer_id, sold_via, price, premium, gst, admin_fee, subtotal, mode,
    card_amount, surcharge, balance_due, total, due_at, vehicle_gst, terms_version)
  values (p_lot, p_buyer, p_via, p_price, (b->>'premium')::numeric, (b->>'gst')::numeric,
    (b->>'admin_fee')::numeric, (b->>'subtotal')::numeric, b->>'mode', (b->>'card_amount')::numeric,
    (b->>'surcharge')::numeric, (b->>'balance_due')::numeric, (b->>'total')::numeric,
    business_days_from(now(), setting_num('auction','payment_days')::int),
    case when v_gst_status = 'inc' then round(p_price / 11, 2) else 0 end,
    (select terms_version from profiles where id = p_buyer))
  returning id into v_id;
  -- freeze the listing as it was sold (evidence for any misdescription claim)
  insert into lot_snapshots (lot_id, reason, data)
  select p_lot, 'sold', jsonb_build_object(
    'lot', to_jsonb(l), 'flaws', (select coalesce(jsonb_agg(to_jsonb(f) order by f.sort), '[]') from lot_flaws f where f.lot_id = p_lot),
    'photos', (select coalesce(jsonb_agg(ph.path order by ph.sort), '[]') from lot_photos ph where ph.lot_id = p_lot))
  from lots l where l.id = p_lot;
  return v_id;
end $$;
revoke execute on function public.create_invoice(bigint, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.create_invoice(bigint, uuid, numeric, text) to service_role;

-- The offer to the next bidder quotes the all-in price on this vehicle's fees.
create or replace function public.admin_offer_next_bidder(p_lot bigint, p_hours int default 24, p_seller_ok boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l lots%rowtype; v_reserve numeric; v_default uuid; v_next uuid; v_amount numeric; v_id uuid; v_exp timestamptz; v_total numeric;
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  select * into l from lots where id = p_lot for update;
  if l.status <> 'passed' then raise exception 'not_passed:only a vehicle whose sale was cancelled can be offered to the next bidder'; end if;
  select buyer_id into v_default from invoices where lot_id = p_lot and status = 'cancelled' order by created_at desc limit 1;
  if v_default is null then raise exception 'no_cancelled_sale:there''s no cancelled sale for this vehicle'; end if;
  update second_chance_offers set status = 'expired', decided_at = now() where lot_id = p_lot and status = 'pending' and expires_at <= now();
  if exists (select 1 from second_chance_offers where lot_id = p_lot and status = 'pending') then raise exception 'offer_open:an offer to the next bidder is already open'; end if;
  select b.bidder_id, max(b.amount) into v_next, v_amount from bids b join profiles p on p.id = b.bidder_id
   where b.lot_id = p_lot and b.bidder_id <> v_default and not p.suspended
     and not exists (select 1 from second_chance_offers x where x.lot_id = p_lot and x.user_id = b.bidder_id)
     and not exists (select 1 from invoices i where i.lot_id = p_lot and i.buyer_id = b.bidder_id)
   group by b.bidder_id order by max(b.amount) desc, min(b.created_at) asc limit 1;
  if v_next is null then raise exception 'no_next_bidder:there''s no other bidder to offer it to'; end if;
  select reserve_price into v_reserve from lot_private where lot_id = p_lot;
  if v_reserve is not null and v_amount < v_reserve and not p_seller_ok then
    raise exception 'below_reserve:the next bid ($%) is below the reserve. Get the seller''s agreement first', to_char(v_amount, 'FM999,999,990');
  end if;
  v_exp := now() + make_interval(hours => greatest(4, least(coalesce(p_hours, 24), 72)));
  insert into second_chance_offers (lot_id, user_id, amount, expires_at, created_by) values (p_lot, v_next, v_amount, v_exp, auth.uid())
    returning id into v_id;
  v_total := (lot_price_breakdown(p_lot, v_amount)->>'total')::numeric;
  perform queue_notice(v_next, 'account', 'You can still buy the ' || l.title,
    'The winning bidder didn''t pay. You can buy it for your highest bid of $' || to_char(v_amount, 'FM999,999,990')
    || ' ($' || to_char(v_total, 'FM999,999,990.00') || ' all-in with fees) until '
    || to_char(v_exp at time zone 'Australia/Brisbane', 'FMDy DD Mon, FMHH12:MI am') || ' (Brisbane time). There''s no obligation: accept or decline on the offer page.',
    '/offers/' || v_id, 'second-chance:' || v_id);
  return jsonb_build_object('id', v_id, 'amount', v_amount, 'expires_at', v_exp);
end $$;
revoke execute on function public.admin_offer_next_bidder(bigint, int, boolean) from public, anon;
grant execute on function public.admin_offer_next_bidder(bigint, int, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2 and 4. Paid in full: the seller's payout uses the fee they signed up to; the
--          collection window waits for the ownership transfer (transfer_completed sets it).
-- ---------------------------------------------------------------------------
alter table public.seller_payouts add column if not exists kind text not null default 'sale';
alter table public.seller_payouts drop constraint if exists seller_payouts_kind_check;
alter table public.seller_payouts add constraint seller_payouts_kind_check check (kind in ('sale','forfeit'));

create or replace function public.on_invoice_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare l public.lots%rowtype; pr public.lot_private%rowtype; v_fee numeric; v_rate numeric; v_min numeric; v_signed jsonb;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    select * into l from lots where id = new.lot_id;
    select * into pr from lot_private where lot_id = new.lot_id;
    select fees into v_signed from seller_agreements where lot_id = new.lot_id and status = 'signed' order by signed_at desc nulls last limit 1;
    v_rate := coalesce((v_signed->>'seller_fee_rate')::numeric, setting_num('fees','seller_fee_rate'), 0);
    v_min := coalesce((v_signed->>'seller_fee_min')::numeric, setting_num('fees','seller_fee_min'), 0);
    v_fee := greatest(v_min, round(new.price * v_rate, 2));
    insert into seller_payouts (lot_id, invoice_id, seller_id, sale_price, seller_fee, fee_gst, lender_payout, lender_name, lender_ref, net_amount, status, hold_reason)
    select new.lot_id, new.id, l.seller_id, new.price, v_fee, round(v_fee * 0.10, 2), coalesce(pr.finance_owing, 0), pr.lender_name, pr.lender_ref, x.net,
      case when x.net < 0 then 'on_hold' else 'pending' end,
      case when x.net < 0 then 'Finance owing is more than the sale price: the seller must pay the lender the shortfall before we settle' end
    from (select new.price - v_fee - round(v_fee * 0.10, 2) - coalesce(pr.finance_owing, 0) as net) x
    on conflict (invoice_id) do nothing;
  end if;
  return new;
end $$;

-- Paid but not yet transferred: no collection deadline (and so no storage) yet.
update public.invoices i set collect_by = null
  where i.status = 'paid' and i.collected_at is null
    and exists (select 1 from public.ownership_transfers t where t.invoice_id = i.id and t.status <> 'complete');

-- ---------------------------------------------------------------------------
-- 3. Failed charges, refunds and why a sale was cancelled (and the terms version, above)
-- ---------------------------------------------------------------------------
alter table public.invoices add column if not exists failed_at timestamptz;
alter table public.invoices add column if not exists refunded_amount numeric(12,2);
alter table public.invoices add column if not exists refunded_at timestamptz;
alter table public.invoices add column if not exists refund_note text;
alter table public.invoices add column if not exists cancel_reason text;

create or replace function public.invoice_failed_at() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'payment_failed' and old.status is distinct from 'payment_failed' then new.failed_at := now(); end if;
  return new;
end $$;
drop trigger if exists invoice_failed_at on public.invoices;
create trigger invoice_failed_at before update of status on public.invoices
  for each row execute function public.invoice_failed_at();
update public.invoices set failed_at = coalesce(charging_at, created_at) where status = 'payment_failed' and failed_at is null;

-- ---------------------------------------------------------------------------
-- 5. Any bid in the closing minutes extends the auction (whichever path placed it)
-- ---------------------------------------------------------------------------
create or replace function public.bid_extends_auction() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_extend interval := make_interval(mins => coalesce(setting_num('auction','extend_minutes'), 10)::int);
begin
  update lots set ends_at = now() + v_extend, updated_at = now()
   where id = new.lot_id and status = 'live' and ends_at > now() and ends_at < now() + v_extend;
  return new;
end $$;
drop trigger if exists bid_extends_auction on public.bids;
create trigger bid_extends_auction after insert on public.bids
  for each row execute function public.bid_extends_auction();

-- ---------------------------------------------------------------------------
-- 6. The reserve can be lowered, never raised, once there are bids
-- ---------------------------------------------------------------------------
create or replace function public.reserve_locked() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.reserve_price is not null and (old.reserve_price is null or new.reserve_price > old.reserve_price)
     and exists (select 1 from lots where id = new.lot_id and bid_count > 0 and status in ('live','referred','offers')) then
    raise exception 'reserve_locked:the reserve can''t be raised (or added) once there are bids. It can only be lowered or removed';
  end if;
  return new;
end $$;
drop trigger if exists reserve_locked on public.lot_private;
create trigger reserve_locked before update of reserve_price on public.lot_private
  for each row execute function public.reserve_locked();

-- ---------------------------------------------------------------------------
-- 7. Corrections: more key facts, damage and flaws, and wording for each stage
-- ---------------------------------------------------------------------------
-- Tells bidders and watchers about a correction (the caller has already logged it and extended bidding).
create or replace function public.lot_correction_notice(p_lot bigint, p_title text, p_status text, p_ends timestamptz, p_changes text[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_bidders uuid[]; v_users uuid[]; v_body text;
  v_tag text := floor(extract(epoch from clock_timestamp()))::bigint::text || ':' || left(md5(array_to_string(p_changes, '|')), 8);
begin
  select array_agg(distinct bidder_id) into v_bidders from bids where lot_id = p_lot;
  select array_agg(distinct user_id) into v_users from watchlist where lot_id = p_lot and not (user_id = any(coalesce(v_bidders, '{}')));
  v_body := 'We''ve corrected this listing: ' || array_to_string(p_changes[1:6], '; ') || case when cardinality(p_changes) > 6 then '; and more' else '' end || '.'
    || case when p_status = 'live' then ' Bidding now ends no earlier than '
         || to_char(p_ends at time zone 'Australia/Brisbane', 'FMDy DD Mon, FMHH12:MI am') || ' (Brisbane time).' else '' end;
  if v_bidders is not null then
    perform queue_notice_many(v_bidders, 'account', 'Correction to a vehicle you bid on: ' || p_title,
      v_body || case when p_status = 'live'
        then ' If this changes your mind, call the consultant on the listing before bidding ends and we''ll cancel your bids.'
        else ' If this changes your mind, call the consultant on the listing before the seller accepts, and we''ll release you from your bid or offer.' end,
      '/lot/' || p_lot || '#changes', 'correction:' || p_lot || ':' || v_tag);
  end if;
  if v_users is not null then
    perform queue_notice_many(v_users, 'ending', 'Correction to a vehicle you''re watching: ' || p_title, v_body,
      '/lot/' || p_lot || '#changes', 'correction-w:' || p_lot || ':' || v_tag);
  end if;
end $$;
revoke execute on function public.lot_correction_notice(bigint, text, text, timestamptz, text[]) from public, anon, authenticated;

create or replace function public.lot_corrections_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := to_jsonb(old); n jsonb := to_jsonb(new);
  f record; k text; changes text[] := '{}';
begin
  if old.status not in ('live','referred','offers') then return new; end if;
  for f in select * from (values
      ('title','Title'), ('year','Year'), ('make','Make'), ('model','Model'), ('variant','Variant'), ('body','Body'), ('engine','Engine'),
      ('transmission','Transmission'), ('fuel','Fuel'), ('drive','Drive'), ('odometer','Odometer'), ('hours','Hours'),
      ('vin','VIN'), ('build_date','Build date'), ('compliance_date','Compliance date'), ('registration','Registration'),
      ('rego_plate','Plate'), ('rego_state','Registration state'),
      ('rego_expiry','Registration expiry'), ('write_off_status','Write-off status'), ('stolen_clear','Stolen check'),
      ('ppsr_clear','PPSR finance check'), ('keys','Keys'), ('service_books','Service books'), ('runs','Starts and drives'),
      ('known_faults','Known faults'), ('service_history','Service history'), ('roadworthy_note','Roadworthy'),
      ('visual_grade','Visual grade'), ('grade_paint','Paint grade'), ('grade_interior','Interior grade'), ('grade_tyres','Tyre grade'),
      ('tyre_tread','Tyre tread'), ('seats','Seats'), ('gvm_kg','GVM'), ('seller_type','Seller'), ('gst_status','GST'),
      ('ev_battery_soh','Battery health'), ('colour','Colour'), ('take','Description'), ('suburb','Location'), ('state','State')) t(field, label)
  loop
    if o->f.field is distinct from n->f.field then
      insert into lot_corrections (lot_id, field, label, before, after)
        values (new.id, f.field, f.label, fact_text(f.field, o->f.field), fact_text(f.field, n->f.field));
      changes := changes || case when f.field = 'take' then 'Description updated (see the listing)'
        else f.label || ': ' || fact_text(f.field, o->f.field) || ' → ' || fact_text(f.field, n->f.field) end;
    end if;
  end loop;
  for k in select distinct key from (select jsonb_object_keys(coalesce(o->'disclosures', '{}')) key
                                     union select jsonb_object_keys(coalesce(n->'disclosures', '{}'))) s
           where key not in ('finance_amount','lender_name','lender_ref','rego_expiry','business','runs')
  loop
    if o->'disclosures'->k is distinct from n->'disclosures'->k then
      insert into lot_corrections (lot_id, field, label, before, after)
        values (new.id, 'disclosures.' || k, 'Seller declared: ' || replace(k, '_', ' '),
          fact_text(k, o->'disclosures'->k), fact_text(k, n->'disclosures'->k));
      changes := changes || ('Seller declared ' || replace(k, '_', ' ') || ': ' || fact_text(k, n->'disclosures'->k));
    end if;
  end loop;
  if cardinality(changes) = 0 then return new; end if;

  new.corrected_at := now();
  if new.status = 'live' and new.ends_at is not null and new.ends_at < now() + interval '24 hours' then
    new.ends_at := now() + interval '24 hours';
  end if;
  perform lot_correction_notice(new.id, new.title, new.status, new.ends_at, changes);
  return new;
end $$;

drop trigger if exists lot_corrections_log on public.lots;
create trigger lot_corrections_log before update on public.lots
  for each row
  when ((old.year, old.make, old.model, old.variant, old.body, old.engine, old.transmission, old.fuel, old.drive, old.odometer,
         old.hours, old.vin, old.build_date, old.compliance_date, old.registration, old.rego_expiry, old.write_off_status,
         old.stolen_clear, old.ppsr_clear, old.keys, old.service_books, old.runs, old.known_faults, old.service_history,
         old.roadworthy_note, old.visual_grade, old.grade_paint, old.grade_interior, old.grade_tyres, old.tyre_tread, old.seats,
         old.gvm_kg, old.seller_type, old.gst_status, old.ev_battery_soh, old.colour, old.disclosures,
         old.title, old.rego_plate, old.rego_state, old.take, old.suburb, old.state)
    is distinct from
        (new.year, new.make, new.model, new.variant, new.body, new.engine, new.transmission, new.fuel, new.drive, new.odometer,
         new.hours, new.vin, new.build_date, new.compliance_date, new.registration, new.rego_expiry, new.write_off_status,
         new.stolen_clear, new.ppsr_clear, new.keys, new.service_books, new.runs, new.known_faults, new.service_history,
         new.roadworthy_note, new.visual_grade, new.grade_paint, new.grade_interior, new.grade_tyres, new.tyre_tread, new.seats,
         new.gvm_kg, new.seller_type, new.gst_status, new.ev_battery_soh, new.colour, new.disclosures,
         new.title, new.rego_plate, new.rego_state, new.take, new.suburb, new.state))
  execute function public.lot_corrections_log();

-- Damage and flaws are edited one field at a time, so changes are gathered and announced by the clock
-- once staff have stopped editing for 5 minutes (one correction, one alert).
create table if not exists public.lot_flaw_changes (
  lot_id bigint primary key references public.lots(id) on delete cascade,
  before_text text not null,
  changed_at timestamptz not null default now()
);
alter table public.lot_flaw_changes enable row level security;

create or replace function public.flaw_summary(p_lot bigint) returns text
language sql stable set search_path = public as $$
  select coalesce(left(string_agg(title || coalesce(': ' || nullif(trim(note), ''), '') || case when photo_path is not null then ' (photo)' else '' end,
    '; ' order by sort, title), 600), 'none listed') from lot_flaws where lot_id = p_lot
$$;

create or replace function public.lot_flaws_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lot bigint := coalesce(new.lot_id, old.lot_id);
begin
  -- staff edits only (seeds and migrations run without a signed-in role)
  if coalesce(auth.role(), '') not in ('authenticated','service_role') then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and (new.title, new.note, new.photo_path) is not distinct from (old.title, old.note, old.photo_path) then return new; end if;
  if not exists (select 1 from lots where id = v_lot and status in ('live','referred','offers')) then return coalesce(new, old); end if;
  insert into lot_flaw_changes (lot_id, before_text) values (v_lot, flaw_summary(v_lot))
    on conflict (lot_id) do update set changed_at = now();
  return coalesce(new, old);
end $$;
drop trigger if exists lot_flaws_changed on public.lot_flaws;
create trigger lot_flaws_changed before insert or update or delete on public.lot_flaws
  for each row execute function public.lot_flaws_changed();

create or replace function public.announce_flaw_changes(p_quiet interval default interval '5 minutes') returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_after text; n int := 0; v_lot lots%rowtype;
begin
  for r in select fc.*, l.status from lot_flaw_changes fc join lots l on l.id = fc.lot_id
            where fc.changed_at <= now() - p_quiet for update of fc skip locked loop
    delete from lot_flaw_changes where lot_id = r.lot_id;
    v_after := flaw_summary(r.lot_id);
    if r.status in ('live','referred','offers') and v_after is distinct from r.before_text then
      insert into lot_corrections (lot_id, field, label, before, after) values (r.lot_id, 'flaws', 'Damage and flaws', r.before_text, v_after);
      update lots set corrected_at = now(),
        ends_at = case when status = 'live' and ends_at < now() + interval '24 hours' then now() + interval '24 hours' else ends_at end
       where id = r.lot_id returning * into v_lot;
      perform lot_correction_notice(v_lot.id, v_lot.title, v_lot.status, v_lot.ends_at, array['Damage and flaws: ' || v_after]);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.announce_flaw_changes(interval) from public, anon, authenticated;
grant execute on function public.announce_flaw_changes(interval) to service_role;

-- ---------------------------------------------------------------------------
-- 8. This is a new version of the Terms of Sale and the Seller Agency Agreement. Members accept it before
--    their next bid (bid_guard). Only moves the version on if an admin hasn't already set their own.
-- ---------------------------------------------------------------------------
update public.settings set value = value || '{"buyer_version": "2026-10-10", "seller_version": "2026-10-10"}'::jsonb
  where key = 'terms' and value->>'buyer_version' = '2026-10-01';
