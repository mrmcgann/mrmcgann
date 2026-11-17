-- Super Trucker: viewing times on the truck's own clock.
--
-- A viewing happens where the truck is kept. Western Australia is two hours behind Brisbane all year, and New South
-- Wales an hour ahead from October to April (the launch falls in daylight saving), so telling a member or an owner a
-- time "in Brisbane time" invites someone to turn up at the wrong hour. Every message about a viewing now gives the
-- time in the truck's state (state_tz(), migration 26), with its name; staff enter the time on the owner's clock too
-- (/admin/viewings, localToIso() in src/lib/viewings.ts).

-- "Tuesday 1 December, 10:00 am (Perth time)"
create or replace function public.local_when(p_at timestamptz, p_state text) returns text
language sql stable set search_path = public as $$
  select to_char(p_at at time zone state_tz(p_state), 'FMDay FMDD FMMonth, FMHH12:MI am') || ' ('
    || case state_tz(p_state)
         when 'Australia/Sydney' then 'Sydney time' when 'Australia/Melbourne' then 'Melbourne time'
         when 'Australia/Hobart' then 'Hobart time' when 'Australia/Adelaide' then 'Adelaide time'
         when 'Australia/Darwin' then 'Darwin time' when 'Australia/Perth' then 'Perth time'
         else 'Queensland time' end || ')'
$$;
revoke execute on function public.local_when(timestamptz, text) from public, anon;
grant execute on function public.local_when(timestamptz, text) to authenticated, service_role;

-- Staff confirm (address to the member, the member's name to the owner), decline, or record how it went.
create or replace function public.admin_viewing(p_id uuid, p_action text, p_starts timestamptz default null, p_host text default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v record; v_when text; v_addr text; v_notes text; v_name text;
begin
  if not is_admin() and coalesce((select auth.role()), '') <> 'service_role' then raise exception 'forbidden'; end if;
  select w.*, l.title, l.suburb, l.state, l.status lot_status into v from viewings w join lots l on l.id = w.lot_id where w.id = p_id for update of w;
  if not found then raise exception 'viewing_not_found'; end if;
  if p_action = 'confirm' then
    if v.status not in ('requested', 'confirmed') then raise exception 'viewing_not_open'; end if;
    if p_starts is null or p_starts < now() then raise exception 'viewing_time'; end if;
    select seller_address, pickup_notes into v_addr, v_notes from lot_private where lot_id = v.lot_id;
    if coalesce(trim(v_addr), '') = '' then raise exception 'viewing_no_address'; end if;
    update viewings set status = 'confirmed', starts_at = p_starts, host = 'seller', staff_note = coalesce(left(p_note, 500), staff_note),
      reminded_at = null, address_sent_at = now(), status_at = now() where id = p_id;
    v_when := local_when(p_starts, v.state);
    select trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_name from profiles where id = v.user_id;
    perform queue_notice(v.user_id, 'account', 'Viewing booked: ' || v.title,
      v_when || ' at ' || v_addr || '.' || coalesce(' ' || nullif(trim(v_notes), ''), '')
        || ' Bring photo ID and this reference: ' || v.ref || '. Look it over and hear it run; no road test. Bring a mechanic if you like. '
        || 'Keep the address to yourself, and keep any talk of price for the auction: you agreed when you booked that every sale goes through Super Trucker. '
        || 'Can''t make it? Cancel from the listing so nobody waits.' || coalesce(' ' || nullif(trim(p_note), ''), ''),
      '/lot/' || v.lot_id, 'viewing-confirm:' || p_id || ':' || extract(epoch from p_starts)::bigint);
    perform queue_seller_notice(v.lot_id, 'Viewing booked: ' || v.title,
      coalesce(nullif(v_name, ''), 'A verified member') || ' will come to view it on ' || v_when || ' (booking ' || v.ref || '). They''ll show photo ID. '
        || 'We introduced them to you, like everyone we send: section 2 of your agreement covers a sale to them. '
        || 'Let them look it over and hear it run; no road test. If they, or anyone, ask to buy it direct, say no and tell us. Can''t do that time? Call us straight away.',
      '/sell/dashboard', 'viewing-seller:' || p_id || ':' || extract(epoch from p_starts)::bigint);
  elsif p_action = 'decline' then
    if v.status not in ('requested', 'confirmed') then return; end if;
    update viewings set status = 'declined', staff_note = left(p_note, 500), status_at = now() where id = p_id;
    perform queue_notice(v.user_id, 'account', 'We couldn''t book your viewing',
      'For ' || v.title || ': ' || coalesce(nullif(p_note, ''), 'none of the times worked.') || ' You can ask for other times on the listing.',
      '/lot/' || v.lot_id, 'viewing-decline:' || p_id);
    if v.status = 'confirmed' then
      perform queue_seller_notice(v.lot_id, 'Viewing cancelled: ' || v.title,
        'The viewing for ' || local_when(v.starts_at, v.state) || ' is off. Nobody will come.',
        '/sell/dashboard', 'viewing-cancel:' || p_id);
    end if;
  elsif p_action in ('done', 'no_show') then
    if v.status <> 'confirmed' then raise exception 'viewing_not_confirmed'; end if;
    update viewings set status = p_action, staff_note = coalesce(left(p_note, 500), staff_note), status_at = now() where id = p_id;
  else
    raise exception 'viewing_action';
  end if;
end $$;
revoke execute on function public.admin_viewing(uuid, text, timestamptz, text, text) from public, anon;
grant execute on function public.admin_viewing(uuid, text, timestamptz, text, text) to authenticated, service_role;

-- The member cancels their own booking; the owner hears if it had been confirmed.
create or replace function public.cancel_viewing(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select w.*, l.title, l.state into v from viewings w join lots l on l.id = w.lot_id where w.id = p_id and w.user_id = (select auth.uid()) for update of w;
  if not found then raise exception 'viewing_not_found'; end if;
  if v.status not in ('requested', 'confirmed') then return; end if;
  update viewings set status = 'cancelled', status_at = now() where id = p_id;
  if v.status = 'confirmed' and v.kind = 'in_person' and v.host = 'seller' then
    perform queue_seller_notice(v.lot_id, 'Viewing cancelled: ' || v.title,
      'The visitor cancelled the viewing for ' || local_when(v.starts_at, v.state) || '. Nobody will come.',
      '/sell/dashboard', 'viewing-cancel:' || p_id);
  end if;
end $$;
revoke execute on function public.cancel_viewing(uuid) from public, anon;
grant execute on function public.cancel_viewing(uuid) to authenticated, service_role;

-- The reminder an hour or so before, to both sides, and closing bookings for a truck no longer open for viewing.
create or replace function public.viewing_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare v record; n int := 0;
begin
  for v in select w.*, l.title, l.state from viewings w join lots l on l.id = w.lot_id
           where w.status = 'confirmed' and w.reminded_at is null and w.starts_at between now() and now() + interval '75 minutes'
           order by w.starts_at limit 200 for update of w skip locked loop
    update viewings set reminded_at = now() where id = v.id;
    perform queue_notice(v.user_id, 'account', 'Soon: your viewing of ' || v.title,
      'At ' || local_when(v.starts_at, v.state) || '. Bring photo ID and your reference ' || v.ref
        || '. Can''t make it? Cancel from the listing.', '/lot/' || v.lot_id, 'viewing-remind:' || v.id);
    perform queue_seller_notice(v.lot_id, 'Viewing soon: ' || v.title,
      'Your visitor is due at ' || local_when(v.starts_at, v.state) || ' (booking ' || v.ref || '). Looking and listening only, no road test.',
      '/sell/dashboard', 'viewing-remind-seller:' || v.id);
    n := n + 1;
  end loop;
  with gone as (
    update viewings w set status = 'cancelled', staff_note = 'The vehicle is no longer open for viewing', status_at = now()
    from lots l where l.id = w.lot_id and w.status in ('requested', 'confirmed')
      and (l.status not in ('live', 'scheduled') or coalesce(l.live_state, 'waiting') <> 'waiting')
    returning w.id
  )
  select n + count(*) into n from gone;
  return n;
end $$;
revoke execute on function public.viewing_sweep() from public, anon, authenticated;
grant execute on function public.viewing_sweep() to service_role;

-- ---------------------------------------------------------------------------
-- Truck specifications buyers compare before anything else. A prime mover's GCM decides what it can pull (a B-double
-- needs a rating to match), the axle configuration decides the work it suits, and the cab, suspension, tare, power and
-- emissions standard are the rest of the first screen of any truck sale. Public facts, shown on the listing (web and
-- app), entered in the editor for trucks and buses. None of them is required to publish.
-- ---------------------------------------------------------------------------
alter table public.lots
  add column if not exists configuration text,
  add column if not exists gcm_kg int,
  add column if not exists tare_kg int,
  add column if not exists engine_hp int,
  add column if not exists cab text,
  add column if not exists suspension text,
  add column if not exists emissions text;
alter table public.lots drop constraint if exists lots_truck_specs;
alter table public.lots add constraint lots_truck_specs check (
  (configuration is null or configuration ~ '^[0-9]{1,2}x[0-9]{1,2}$')
  and (gcm_kg is null or gcm_kg between 1000 and 200000)
  and (tare_kg is null or tare_kg between 100 and 100000)
  and (engine_hp is null or engine_hp between 20 and 1500)
  and (cab is null or cab in ('day', 'sleeper', 'crew'))
  and (suspension is null or suspension in ('air', 'spring', 'mixed'))
  and (emissions is null or char_length(emissions) <= 40));
