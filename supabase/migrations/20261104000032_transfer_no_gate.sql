-- Putting it in the buyer's name, without holding their vehicle hostage to their own paperwork.
--
-- Until now a buyer could not book a collection until THEIR registration transfer was finished and a staff member
-- had read their uploaded receipt. That made the buyer's own errand the thing keeping their vehicle at our depot:
-- storage days ran, staff chased proof, and nobody could do anything but wait on a government website.
--
-- The gate was there to protect the seller from a buyer who never transfers, so that tolls, fines and renewal
-- notices stop arriving in the seller's name. But that protection comes from the NOTICE OF DISPOSAL, not from the
-- buyer's half, and we lodge the notice ourselves as the owner's agent under the signed consignment authority the
-- day the money clears -- long before anyone collects anything. Once it is lodged the gate protects nobody.
--
-- So: collection needs paid + at the depot + the seller's side lodged (or nothing to lodge). The buyer's own
-- transfer is chased by the clock, with their own state's deadline and their own late fee, which is where that
-- obligation always belonged. Terms sections 2, 9 and 16 are rewritten to match.

-- Who lodged the seller's side, so the audit trail shows a person and not just a timestamp.
alter table public.ownership_transfers add column if not exists lodged_by uuid references auth.users(id);

/* The buyer saying they have done their half. Deliberately not the same thing as 'complete': nothing was checked,
   it is their word, and the column name says so. It exists only to stop the nudges, because now that the buyer's
   transfer gates nothing, demanding a receipt off them would be admin we no longer have any use for. A buyer who
   wants it verified can still upload proof through transfer_submit and have staff complete it. */
alter table public.ownership_transfers add column if not exists buyer_said_done_at timestamptz;

create or replace function public.transfer_buyer_done(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select t.id into v_id from ownership_transfers t join invoices i on i.id = t.invoice_id
    where t.invoice_id = p_invoice and i.buyer_id = auth.uid();
  if v_id is null then raise exception 'not_found'; end if;
  update ownership_transfers set buyer_said_done_at = coalesce(buyer_said_done_at, now()) where id = v_id;
end $$;
revoke execute on function public.transfer_buyer_done(uuid) from public, anon;
grant execute on function public.transfer_buyer_done(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The new gate
-- ---------------------------------------------------------------------------

/* True when nothing stands between this buyer and their vehicle.
   Three ways to be clear, in the order they actually happen:
     - the seller's side is lodged, so the seller is out of harm's way (the normal path);
     - there was never anything to lodge, because the vehicle is sold unregistered and the certificate of sale is
       the whole record of ownership;
     - the whole transfer is already marked complete, which is the old rule and still passes. */
create or replace function public.transfer_clear(p_invoice uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ownership_transfers t
    where t.invoice_id = p_invoice
      and (t.seller_done_at is not null or t.registration = 'unregistered' or t.status = 'complete')
  );
$$;
revoke execute on function public.transfer_clear(uuid) from public, anon;
grant execute on function public.transfer_clear(uuid) to authenticated, service_role;

-- The booking gate. Still blocks the depot's address from being released early, which is its other job, but it no
-- longer waits on the buyer. collection_needs_depot still runs before this one.
create or replace function public.collection_needs_transfer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not transfer_clear(new.invoice_id) then
    raise exception 'transfer_not_done';
  end if;
  return new;
end $$;

drop trigger if exists collection_needs_transfer on public.collections;
create trigger collection_needs_transfer before insert on public.collections
  for each row execute function public.collection_needs_transfer();

-- When the collection window opens, and the notice that says so. Same shape as migration 21, with the gate
-- swapped and the wording no longer claiming the buyer's paperwork is finished when it may not be.
create or replace function public.collection_ready(p_invoice uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare i record; j record; d record; v_by timestamptz; v_title text;
begin
  select id, buyer_id, lot_id, status, collected_at, collect_by into i from invoices where id = p_invoice for update;
  if not found or i.status <> 'paid' or i.collected_at is not null then return false; end if;
  if not transfer_clear(p_invoice) then return false; end if;
  select * into j from transport_jobs where invoice_id = p_invoice;
  if not found or j.status <> 'at_depot' or (j.condition_ok is false and j.buyer_decision is distinct from 'proceed') then return false; end if;
  v_by := greatest(coalesce(i.collect_by, now()), business_days_from(now(), setting_num('auction','collection_days')::int));
  update invoices set collect_by = v_by where id = p_invoice;
  select title into v_title from lots where id = i.lot_id;
  select suburb, state into d from depots where id = j.depot_id;
  perform queue_notice(i.buyer_id, 'account', 'Ready to collect: ' || v_title,
    'It''s at our depot in ' || coalesce(d.suburb || ', ' || d.state, 'your area') || '. Book a time to collect it by '
      || to_char(v_by at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth') || ' (storage applies after that). We send the address and your release code once your time is confirmed.',
    '/account/invoices/' || p_invoice, 'collect-ready:' || p_invoice);
  return true;
end $$;
revoke execute on function public.collection_ready(uuid) from public, anon, authenticated;
grant execute on function public.collection_ready(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- We lodge the seller's side
-- ---------------------------------------------------------------------------

/* Staff record that they have lodged the notice of disposal with the state, as the owner's agent. The seller is
   told it is done and asked for nothing: their old "Your part" step and "I've done this" button are gone.
   This is also the moment the buyer's collection can open, so it tries collection_ready on the way out. */
create or replace function public.admin_transfer_lodged(p_id uuid, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare t record; v_title text;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into t from ownership_transfers where id = p_id;
  if not found then raise exception 'not_found'; end if;
  if t.registration <> 'registered' then raise exception 'nothing_to_lodge'; end if;

  update ownership_transfers set
    seller_done_at = coalesce(seller_done_at, now()),
    lodged_by = coalesce(lodged_by, auth.uid()),
    seller_reference = coalesce(left(nullif(trim(coalesce(p_reference, '')), ''), 60), seller_reference)
  where id = p_id;

  select title into v_title from lots where id = t.lot_id;
  -- The seller hears about it once, as a result and not as a task.
  perform queue_seller_notice(t.lot_id, 'Registration sorted: ' || coalesce(v_title, 'your vehicle'),
    'We have lodged the notice of disposal for you with the transport authority, so the ' || coalesce(v_title, 'vehicle')
      || ' is no longer your responsibility for tolls, fines or renewals. There is nothing for you to do.',
    '/sell/dashboard', 'transfer-lodged:' || t.lot_id::text);

  perform collection_ready(t.invoice_id);
end $$;
revoke execute on function public.admin_transfer_lodged(uuid, text) from public, anon;
grant execute on function public.admin_transfer_lodged(uuid, text) to authenticated, service_role;

/* The older path, kept so app versions already in the wild keep working: a seller (or staff) marking the seller's
   side done by lot. It now opens the collection window the same way admin_transfer_lodged does -- without this,
   lodging through the old route would leave the buyer's window shut with nothing left to open it. The seller's
   own screens no longer offer this; staff do it for them. */
create or replace function public.transfer_seller_done(p_lot bigint, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_invoice uuid;
begin
  if not exists (select 1 from lots where id = p_lot and seller_id = auth.uid()) and not is_admin() then raise exception 'forbidden'; end if;
  select t.id, t.invoice_id into v_id, v_invoice from ownership_transfers t join invoices i on i.id = t.invoice_id
    where t.lot_id = p_lot and i.status = 'paid' and t.registration = 'registered' order by t.created_at desc limit 1;
  if v_id is null then raise exception 'not_found'; end if;
  update ownership_transfers set seller_done_at = coalesce(seller_done_at, now()),
    seller_reference = coalesce(left(nullif(trim(coalesce(p_reference, '')), ''), 60), seller_reference)
  where id = v_id;
  perform collection_ready(v_invoice);
end $$;
revoke execute on function public.transfer_seller_done(bigint, text) from public, anon;
grant execute on function public.transfer_seller_done(bigint, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The clock chases the buyer, not a person
-- ---------------------------------------------------------------------------

/* Nudge a buyer who hasn't finished their own transfer, at 3, 7 and 12 days after we lodged the seller's side.
   Twelve is deliberately inside every state's 14-day deadline, so the last nudge still leaves time. The dedupe
   key carries the mark, so each buyer gets each nudge once and never a fourth. */
create or replace function public.queue_transfer_reminders(p_limit int default 2000) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_days int;
begin
  for r in
    select t.id, t.invoice_id, t.buyer_id, t.rego_state, t.seller_done_at, l.title,
           floor(extract(epoch from (now() - t.seller_done_at)) / 86400)::int as age
      from ownership_transfers t
      join invoices i on i.id = t.invoice_id
      join lots l on l.id = t.lot_id
     where t.status <> 'complete'
       and t.registration = 'registered'
       and coalesce(t.buyer_choice, '') <> 'unregistered'
       and t.buyer_said_done_at is null
       and t.seller_done_at is not null
       and i.status = 'paid'
       and t.seller_done_at > now() - interval '30 days'
     limit p_limit
  loop
    v_days := case when r.age >= 12 then 12 when r.age >= 7 then 7 when r.age >= 3 then 3 else null end;
    if v_days is null then continue; end if;
    perform queue_notice(r.buyer_id, 'account', 'Transfer the ' || r.title || ' into your name',
      case when v_days = 12
        then 'Your state usually gives you 14 days from the sale, and charges a late fee after that. It takes a couple of minutes and we have already filled in the form -- open your invoice and tap "Transfer it into my name".'
        else 'We have done our part and the seller''s. The last step is yours: open your invoice and tap "Transfer it into my name". The form is already filled in, so it takes a couple of minutes.' end,
      '/account/invoices/' || r.invoice_id, 'transfer-nudge:' || r.id::text || ':' || v_days::text);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_transfer_reminders(int) from public, anon, authenticated;
grant execute on function public.queue_transfer_reminders(int) to service_role;

-- ---------------------------------------------------------------------------
-- The at-depot notice
-- ---------------------------------------------------------------------------

/* Lifted verbatim from migration 21 with one sentence changed. It used to tell the buyer to wait until "the
   transfer of ownership is done", which now reads as a job of theirs when the only thing outstanding is ours.
   With the gate gone this fires only in the gap between the vehicle reaching the depot and us lodging the
   seller's side, so it should say exactly that and ask for nothing. */
create or replace function public.admin_transport(p_job uuid, p_action text, p_data jsonb default '{}'::jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare j public.transport_jobs%rowtype; l record; d record; v_day date; v_win text; v_ok boolean; v_note text; v_admins uuid[];
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
begin
  if not is_admin() and coalesce((select auth.role()), '') <> 'service_role' then raise exception 'forbidden'; end if;
  select * into j from transport_jobs where id = p_job for update;
  if not found then raise exception 'transport_not_found'; end if;
  select id, title, keys into l from lots where id = j.lot_id;
  p_data := coalesce(p_data, '{}'::jsonb);
  v_note := nullif(left(trim(coalesce(p_data->>'note', '')), 500), '');

  if p_action = 'depot' then
    if j.status not in ('to_book', 'booked', 'picked_up') then raise exception 'transport_step:the vehicle is already at the depot'; end if;
    if coalesce(p_data->>'depot_id', '') !~ '^[0-9a-f-]{36}$' or not exists (select 1 from depots where id = (p_data->>'depot_id')::uuid and active) then
      raise exception 'transport_depot';
    end if;
    update transport_jobs set depot_id = (p_data->>'depot_id')::uuid, status_at = now() where id = p_job;
  elsif p_action = 'book' then
    if j.status not in ('to_book', 'booked') then raise exception 'transport_step:it has already been picked up'; end if;
    if j.depot_id is null then raise exception 'transport_depot'; end if;
    if coalesce(p_data->>'day', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'transport_day'; end if;
    v_day := (p_data->>'day')::date;
    if v_day < v_today or v_day > v_today + 60 then raise exception 'transport_day'; end if;
    v_win := case when p_data->>'window' in ('morning', 'afternoon') then p_data->>'window' else 'day' end;
    update transport_jobs set status = 'booked', pickup_on = v_day, pickup_window = v_win,
      carrier_ref = coalesce(nullif(left(trim(coalesce(p_data->>'carrier_ref', '')), 60), ''), carrier_ref),
      staff_note = coalesce(v_note, staff_note), status_at = now() where id = p_job;
    perform queue_seller_notice(j.lot_id, 'Pickup booked: ' || l.title,
      'Our transport partner will pick it up on ' || to_char(v_day, 'FMDay FMDD FMMonth') || ' ' || pickup_window_label(v_win)
        || '. The driver will quote booking reference ' || j.ref || ': only hand it over to them, with all the keys' || coalesce(' (' || l.keys || ')', '')
        || '. Please take out your belongings and any toll tag. Can''t make that time? Call us straight away.',
      '/sell/dashboard', 'transport-booked:' || j.id || ':' || v_day || ':' || v_win);
  elsif p_action = 'picked_up' then
    if j.status not in ('to_book', 'booked') then raise exception 'transport_step:it isn''t waiting to be picked up'; end if;
    if j.depot_id is null then raise exception 'transport_depot'; end if;
    v_ok := coalesce((p_data->>'ok')::boolean, true);
    if not v_ok and v_note is null then raise exception 'transport_note'; end if;
    update transport_jobs set status = 'picked_up', picked_up_at = now(), status_at = now(),
      pickup_odometer = case when coalesce(p_data->>'odometer', '') ~ '^\d{1,7}$' then (p_data->>'odometer')::int end,
      pickup_keys = case when coalesce(p_data->>'keys', '') ~ '^\d{1,2}$' then (p_data->>'keys')::int end,
      condition_ok = v_ok, condition_note = v_note where id = p_job;
    select suburb, state into d from depots where id = j.depot_id;
    if v_ok then
      perform queue_notice(j.buyer_id, 'account', 'On its way to our depot: ' || l.title,
        'Our transport partner has picked it up. It''s going to our depot in ' || coalesce(d.suburb || ', ' || d.state, 'your area') || ': we''ll tell you when it arrives.',
        '/account/invoices/' || j.invoice_id, 'transport-picked:' || j.id);
      perform queue_seller_notice(j.lot_id, 'Picked up: ' || l.title,
        'Thanks. Our transport partner has collected it. We pay you once the buyer has collected it from our depot and their claim window has closed.',
        '/sell/dashboard', 'transport-picked-seller:' || j.id);
    else
      perform queue_notice(j.buyer_id, 'account', 'Please read: a change to the ' || l.title,
        'When our driver picked it up, they noted something the listing doesn''t show: ' || v_note
          || ' You can go ahead with the purchase, or cancel it for a full refund. Choose on your invoice within 2 business days; we''ll call you if we don''t hear from you.',
        '/account/invoices/' || j.invoice_id, 'transport-change:' || j.id);
      perform queue_seller_notice(j.lot_id, 'Picked up: ' || l.title,
        'Our transport partner has collected it. The driver noted something the listing doesn''t show, so we''ve told the buyer and we''ll call you about it.',
        '/sell/dashboard', 'transport-picked-seller:' || j.id);
    end if;
  elsif p_action = 'at_depot' then
    if j.status <> 'picked_up' then raise exception 'transport_step:mark it picked up first'; end if;
    update transport_jobs set status = 'at_depot', at_depot_at = now(), status_at = now() where id = p_job;
    if j.sale_cancelled_at is null and not collection_ready(j.invoice_id) then
      select suburb, state into d from depots where id = j.depot_id;
      perform queue_notice(j.buyer_id, 'account', 'At our depot: ' || l.title,
        'It''s at our depot in ' || coalesce(d.suburb || ', ' || d.state, 'your area') || '. '
          || case when j.condition_ok is false and j.buyer_decision is distinct from 'proceed' then 'Tell us on your invoice whether you''re going ahead, then you can book a time to collect it.'
                  else 'We''re finalising the paperwork with the transport authority. We''ll text you the moment you can book a time to collect it -- there''s nothing for you to do first.' end,
        '/account/invoices/' || j.invoice_id, 'transport-depot:' || j.id);
    end if;
  elsif p_action = 'returned' then
    if j.status not in ('picked_up', 'at_depot') or j.sale_cancelled_at is null then raise exception 'transport_step:only a vehicle whose sale was cancelled goes back to the seller'; end if;
    update transport_jobs set status = 'returned', status_at = now(), staff_note = coalesce(v_note, staff_note) where id = p_job;
  elsif p_action = 'cancel' then
    if j.status not in ('to_book', 'booked') then raise exception 'transport_step:it has already been picked up'; end if;
    if v_note is null then raise exception 'transport_note'; end if;
    update transport_jobs set status = 'cancelled', status_at = now(), staff_note = v_note where id = p_job;
    if j.status = 'booked' then
      perform queue_seller_notice(j.lot_id, 'Pickup cancelled: ' || l.title,
        'The pickup' || coalesce(' on ' || to_char(j.pickup_on, 'FMDay FMDD FMMonth'), '') || ' is off. Your consultant will call you about what happens next.',
        '/sell/dashboard', 'transport-off:' || j.id);
    end if;
  elsif p_action = 'note' then
    update transport_jobs set staff_note = v_note where id = p_job;
  else
    raise exception 'transport_action';
  end if;
  return (select status from transport_jobs where id = p_job);
end $$;
revoke execute on function public.admin_transport(uuid, text, jsonb) from public, anon;
grant execute on function public.admin_transport(uuid, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Terms and seller agreement
-- ---------------------------------------------------------------------------

-- The buyer's obligation and the seller's authority both changed substantively: buyers no longer have to finish
-- their own transfer before collecting, and sellers now authorise us to lodge their notice of disposal for them.
-- Both sides re-accept before their next sale.
update public.settings set value = coalesce(value, '{}'::jsonb) || '{"buyer_version": "2026-11-04", "seller_version": "2026-11-04"}'::jsonb
  where key = 'terms';
