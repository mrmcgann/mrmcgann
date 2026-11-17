-- Super Trucker opens in Queensland, with our own mobile mechanic and the details truck buyers look for.
--
-- 1. Queensland first. The launch sells trucks kept in Queensland only (selling.states ["QLD"]); New South Wales and
--    Western Australia follow. Their rules stay in the engine (certificates, local times, the register's sections 15
--    to 17) and the database test still checks them with the setting widened, so adding a state is a settings change.
-- 2. Book an inspection, two ways (Terms s 5, seller agreement s 7): inspect it yourself (the viewing by appointment,
--    migration 36), or send our mobile mechanic. The mechanic is a service Super Trucker sells (setting
--    selling.mechanic_fee, including GST): staff agree a time with the owner, the member pays by bank transfer, the
--    mechanic looks it over where it's kept (no road test, nothing taken apart), and the report goes to the member who
--    booked it. Anything the mechanic finds goes on the listing for every bidder before the booking can be closed:
--    we sell as the owner's agent, and a fault our own mechanic found can't be kept from the other bidders (ACL s 18).
-- 3. More of the details truck buyers look for (gearbox, rear axles, brakes, wheelbase, fuel capacity, body size,
--    features), and every truck detail becomes a key fact: a change while it's open is logged and told to bidders.
-- 4. Passed in below the reserve: the highest bidder hears from one of our sales consultants. A consultant is a
--    registered motor salesperson (or the licensee), and the words promise nothing about a sale in between.
-- 5. New Terms and seller agreement (17 November 2026): members accept them again before they bid.
--
-- The law behind each is in docs/legal-basis.md (sections 1, 7 and 19).

-- ---------------------------------------------------------------------------
-- 1. Queensland first
-- ---------------------------------------------------------------------------
update public.settings set value = value || '{"states": ["QLD"], "mechanic": true, "mechanic_fee": 495}'::jsonb where key = 'selling';

create or replace function public.selling_states() returns text[]
language sql stable set search_path = public as $$
  select coalesce((select array(select upper(jsonb_array_elements_text(value->'states'))) from settings
                   where key = 'selling' and jsonb_typeof(value->'states') = 'array'), array['QLD']);
$$;

-- ---------------------------------------------------------------------------
-- 2. The details truck buyers look for, and all of them key facts
-- ---------------------------------------------------------------------------
alter table public.lots
  add column if not exists gearbox text,
  add column if not exists rear_axles text,
  add column if not exists brakes text,
  add column if not exists wheelbase_mm int,
  add column if not exists fuel_capacity_l int,
  add column if not exists body_size text,
  add column if not exists features text[];
alter table public.lots drop constraint if exists lots_truck_details;
alter table public.lots add constraint lots_truck_details check (
  (gearbox is null or char_length(gearbox) between 2 and 60)
  and (rear_axles is null or char_length(rear_axles) between 2 and 80)
  and (brakes is null or brakes in ('abs_disc', 'abs_drum', 'abs_disc_drum', 'disc', 'drum', 'disc_drum'))
  and (wheelbase_mm is null or wheelbase_mm between 1500 and 12000)
  and (fuel_capacity_l is null or fuel_capacity_l between 30 and 3000)
  and (body_size is null or char_length(body_size) between 2 and 80)
  and (features is null or (cardinality(features) <= 14 and features <@ array['aircon', 'uhf', 'cruise', 'engine_brake', 'retarder',
       'diff_locks', 'pto', 'tow_coupling', 'fifth_wheel', 'tailgate_loader', 'crane', 'reversing_camera', 'bullbar', 'fridge']::text[])));

-- The labels, word for word with CAB_LABEL, SUSPENSION_LABEL, BRAKES and TRUCK_FEATURES in src/lib/vehicles.ts.
create or replace function public.truck_detail_label(p_field text, p_value text) returns text
language sql immutable as $$
  select case p_field
    when 'cab' then case p_value when 'day' then 'Day cab' when 'sleeper' then 'Sleeper cab' when 'crew' then 'Crew cab' else p_value end
    when 'suspension' then case p_value when 'air' then 'Airbag' when 'spring' then 'Spring' when 'mixed' then 'Airbag and spring' else p_value end
    when 'brakes' then case p_value when 'abs_disc' then 'ABS, disc' when 'abs_drum' then 'ABS, drum'
      when 'abs_disc_drum' then 'ABS, disc front and drum rear' when 'disc' then 'Disc' when 'drum' then 'Drum'
      when 'disc_drum' then 'Disc front, drum rear' else p_value end
    when 'feature' then case p_value when 'aircon' then 'Air conditioning' when 'uhf' then 'UHF radio' when 'cruise' then 'Cruise control'
      when 'engine_brake' then 'Engine brake' when 'retarder' then 'Retarder' when 'diff_locks' then 'Diff locks' when 'pto' then 'PTO'
      when 'tow_coupling' then 'Tow coupling' when 'fifth_wheel' then 'Fifth wheel' when 'tailgate_loader' then 'Tailgate loader'
      when 'crane' then 'Crane' when 'reversing_camera' then 'Reversing camera' when 'bullbar' then 'Bullbar' when 'fridge' then 'Cab fridge'
      else p_value end
    else p_value end
$$;

create or replace function public.fact_text(p_field text, v jsonb) returns text
language sql immutable as $$
  select case
    when v is null or v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb then 'not stated'
    when p_field = 'odometer' then to_char((v #>> '{}')::numeric, 'FM999,999,990') || ' km'
    when p_field = 'hours' then to_char((v #>> '{}')::numeric, 'FM999,999,990') || ' hours'
    when p_field in ('estimate_low', 'estimate_high') then '$' || to_char((v #>> '{}')::numeric, 'FM999,999,990')
    when p_field = 'roadworthy_issued_on' then to_char((v #>> '{}')::date, 'FMDD Mon YYYY')
    when p_field = 'ev_battery_soh' then (v #>> '{}') || '%'
    when p_field in ('gvm_kg', 'gcm_kg', 'tare_kg') then to_char((v #>> '{}')::numeric, 'FM999,999,990') || ' kg'
    when p_field = 'engine_hp' then (v #>> '{}') || ' hp'
    when p_field = 'wheelbase_mm' then to_char((v #>> '{}')::numeric, 'FM999,999,990') || ' mm'
    when p_field = 'fuel_capacity_l' then to_char((v #>> '{}')::numeric, 'FM999,999,990') || ' litres'
    when p_field in ('cab', 'suspension', 'brakes') then truck_detail_label(p_field, v #>> '{}')
    when p_field = 'features' and jsonb_typeof(v) = 'array' then
      coalesce((select string_agg(truck_detail_label('feature', x), ', ' order by x) from jsonb_array_elements_text(v) x), 'not stated')
    when p_field = 'runs' then case v #>> '{}' when 'drives' then 'starts and drives' when 'starts' then 'starts, doesn''t drive'
      when 'no_start' then 'doesn''t start' else 'not tested' end
    when p_field = 'write_off_status' then case v #>> '{}' when 'none' then 'not written off' when 'repairable' then 'repairable write-off'
      when 'inspected' then 'inspected write-off' when 'statutory' then 'statutory write-off' else 'being checked' end
    when jsonb_typeof(v) = 'boolean' then case when v = 'true'::jsonb then 'yes' else 'no' end
    else left(v #>> '{}', 300) end
$$;

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
      ('roadworthy_issued_on','Roadworthy or safety certificate'),
      ('visual_grade','Visual grade'), ('grade_paint','Paint grade'), ('grade_interior','Interior grade'), ('grade_tyres','Tyre grade'),
      ('tyre_tread','Tyre tread'), ('seats','Seats'), ('gvm_kg','GVM'), ('seller_type','Seller'), ('gst_status','GST'),
      ('ev_battery_soh','Battery health'), ('colour','Colour'), ('take','Description'), ('suburb','Collect from'), ('state','State'),
      ('statutory_warranty','Statutory warranty'), ('estimate_low','Estimate (low)'), ('estimate_high','Estimate (high)'),
      ('plates_note','Sold without plates'), ('configuration','Configuration'), ('gcm_kg','GCM'), ('tare_kg','Tare'),
      ('engine_hp','Power'), ('cab','Cab'), ('suspension','Rear suspension'), ('emissions','Emissions'), ('gearbox','Gearbox'),
      ('rear_axles','Rear axles'), ('brakes','Brakes'), ('wheelbase_mm','Wheelbase'), ('fuel_capacity_l','Fuel capacity'),
      ('body_size','Body size'), ('features','Features')) t(field, label)
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
  -- a timed auction keeps 24 hours of bidding after the change (a live one waits 24 hours before it's offered)
  if new.status = 'live' and new.live_state is null and new.ends_at is not null and new.ends_at < now() + interval '24 hours' then
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
         old.title, old.rego_plate, old.rego_state, old.take, old.suburb, old.state, old.statutory_warranty,
         old.roadworthy_issued_on, old.estimate_low, old.estimate_high,
         old.plates_note, old.configuration, old.gcm_kg, old.tare_kg, old.engine_hp, old.cab, old.suspension, old.emissions,
         old.gearbox, old.rear_axles, old.brakes, old.wheelbase_mm, old.fuel_capacity_l, old.body_size, old.features)
    is distinct from
        (new.year, new.make, new.model, new.variant, new.body, new.engine, new.transmission, new.fuel, new.drive, new.odometer,
         new.hours, new.vin, new.build_date, new.compliance_date, new.registration, new.rego_expiry, new.write_off_status,
         new.stolen_clear, new.ppsr_clear, new.keys, new.service_books, new.runs, new.known_faults, new.service_history,
         new.roadworthy_note, new.visual_grade, new.grade_paint, new.grade_interior, new.grade_tyres, new.tyre_tread, new.seats,
         new.gvm_kg, new.seller_type, new.gst_status, new.ev_battery_soh, new.colour, new.disclosures,
         new.title, new.rego_plate, new.rego_state, new.take, new.suburb, new.state, new.statutory_warranty,
         new.roadworthy_issued_on, new.estimate_low, new.estimate_high,
         new.plates_note, new.configuration, new.gcm_kg, new.tare_kg, new.engine_hp, new.cab, new.suspension, new.emissions,
         new.gearbox, new.rear_axles, new.brakes, new.wheelbase_mm, new.fuel_capacity_l, new.body_size, new.features))
  execute function public.lot_corrections_log();

-- ---------------------------------------------------------------------------
-- 3. Our mobile mechanic
-- ---------------------------------------------------------------------------
-- The fee and the switch are public (the listing shows them); both live in the public 'selling' settings.
create or replace function public.mechanic_on() returns boolean
language sql stable set search_path = public as $$
  select coalesce((select (value->>'mechanic')::boolean from settings where key = 'selling'), true);
$$;
create or replace function public.mechanic_fee() returns numeric
language sql stable set search_path = public as $$
  select greatest(round(coalesce((select (value->>'mechanic_fee')::numeric from settings where key = 'selling'), 495)), 0);
$$;

-- What a member agrees to when they book the mechanic: stored on the booking, word for word with inspectionAck() in
-- src/lib/inspections.ts (the database test holds the two together). Change both with Terms section 5.
create or replace function public.inspection_ack_text(p_fee numeric) returns text
language sql immutable as $$
  select 'I''m asking Super Trucker''s mobile mechanic to inspect this vehicle where it''s kept, for $'
    || to_char(round(p_fee), 'FM999,999,990') || ' including GST. Super Trucker agrees a time with the owner, then I pay by bank '
    || 'transfer before the mechanic goes: if it isn''t paid in time, the booking lapses. It''s a look over and a run of the engine, '
    || 'with no road test and nothing taken apart, so it can''t find every fault. The report is the mechanic''s opinion on the day, '
    || 'and it comes to me. Super Trucker sells the vehicle as the owner''s agent: the owner is told what the mechanic finds, and '
    || 'any fault is added to the listing for every bidder. I can cancel for a full refund until 24 hours before the booked time.';
$$;

create sequence if not exists public.mechanic_inspection_seq start 10001;
create table if not exists public.mechanic_inspections (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('IN-' || nextval('public.mechanic_inspection_seq')),
  lot_id bigint not null references public.lots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'booked', 'paid', 'done', 'cancelled', 'declined')),
  slots jsonb not null default '[]'::jsonb,       -- the member's preferred days: [{day, part}]
  note text,                                      -- anything the member wants the mechanic to look at
  fee numeric(10,2) not null check (fee >= 0),    -- including GST, fixed when they book
  ack_text text not null,
  ack_version text,
  ack_at timestamptz not null default now(),
  starts_at timestamptz,                          -- the time agreed with the owner (shown on the truck's own clock)
  mechanic text,                                  -- who goes
  pay_by timestamptz,                             -- paid by then, or the booking lapses
  paid_at timestamptz,
  paid_note text,
  report_path text,                               -- private bucket inspection-reports, bookings/<id>/…
  summary text,                                   -- the mechanic's findings in a few lines
  faults_listed boolean,                          -- staff confirmed the listing shows what was found
  done_at timestamptz,
  refund_due numeric(10,2),
  refunded_at timestamptz,
  staff_note text,                                -- the reason the member sees when it's declined or cancelled
  reminded_at timestamptz,
  status_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists mechanic_inspections_lot on public.mechanic_inspections (lot_id, status);
create index if not exists mechanic_inspections_user on public.mechanic_inspections (user_id, created_at desc);
create index if not exists mechanic_inspections_open on public.mechanic_inspections (status, pay_by) where status in ('requested', 'booked', 'paid');
create index if not exists mechanic_inspections_due on public.mechanic_inspections (starts_at) where status = 'paid' and reminded_at is null;
create index if not exists mechanic_inspections_refund on public.mechanic_inspections (created_at) where refund_due > 0 and refunded_at is null;
alter table public.mechanic_inspections enable row level security;
drop policy if exists mechanic_inspections_read on public.mechanic_inspections;
create policy mechanic_inspections_read on public.mechanic_inspections for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
revoke all on public.mechanic_inspections from anon;
revoke insert, update, delete on public.mechanic_inspections from authenticated;
grant select on public.mechanic_inspections to authenticated;
revoke all on sequence public.mechanic_inspection_seq from anon, authenticated;

-- A member asks: up to three preferred days (mornings or afternoons) from tomorrow to the day before the auction.
create or replace function public.request_inspection(p_lot bigint, p_slots jsonb, p_note text default null, p_ack boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid()); p record; l record; s jsonb; v_slots jsonb := '[]'::jsonb;
  v_today date := (now() at time zone 'Australia/Brisbane')::date; v_last date; v_sale timestamptz;
  v_fee numeric := mechanic_fee(); v_id uuid; v_ref text; v_admins uuid[];
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not mechanic_on() then raise exception 'inspection_not_offered'; end if;
  select id, suspended, first_name, last_name into p from profiles where id = v_uid;
  if coalesce(p.suspended, false) then raise exception 'account_suspended'; end if;
  select id, title, status, ends_at, seller_id, suburb, state, sale_id, live_state into l from lots where id = p_lot;
  if not found or l.status not in ('live', 'scheduled') or coalesce(l.live_state, 'waiting') <> 'waiting' then
    raise exception 'inspection_closed';
  end if;
  if l.seller_id = v_uid then raise exception 'inspection_own_vehicle'; end if;
  if not can_bid(v_uid) then raise exception 'inspection_needs_id'; end if;
  if not coalesce(p_ack, false) then raise exception 'inspection_ack'; end if;

  select starts_at into v_sale from sales where id = l.sale_id and mode = 'live';
  v_last := least(v_today + 21, coalesce((v_sale at time zone 'Australia/Brisbane')::date - 1,
                                          (l.ends_at at time zone 'Australia/Brisbane')::date - 1, v_today + 21));
  if v_last < v_today + 1 then raise exception 'inspection_too_close'; end if;
  if jsonb_typeof(p_slots) is distinct from 'array' or jsonb_array_length(p_slots) not between 1 and 3 then
    raise exception 'inspection_times';
  end if;
  for s in select * from jsonb_array_elements(p_slots) loop
    if coalesce(s->>'part', '') not in ('morning', 'afternoon') or coalesce(s->>'day', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'inspection_times';
    end if;
    if (s->>'day')::date < v_today + 1 or (s->>'day')::date > v_last then raise exception 'inspection_times_range'; end if;
    if not v_slots @> jsonb_build_array(jsonb_build_object('day', s->>'day', 'part', s->>'part')) then
      v_slots := v_slots || jsonb_build_array(jsonb_build_object('day', s->>'day', 'part', s->>'part'));
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtext('inspection:' || v_uid::text));
  if exists (select 1 from mechanic_inspections where lot_id = p_lot and user_id = v_uid and status in ('requested', 'booked', 'paid')) then
    raise exception 'inspection_already';
  end if;
  if (select count(*) from mechanic_inspections where user_id = v_uid and status in ('requested', 'booked', 'paid')) >= 3
     or (select count(*) from mechanic_inspections where user_id = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'inspection_too_many';
  end if;

  insert into mechanic_inspections (lot_id, user_id, slots, note, fee, ack_text, ack_version)
    values (p_lot, v_uid, v_slots, left(nullif(trim(p_note), ''), 500), v_fee, inspection_ack_text(v_fee),
            (select value->>'buyer_version' from settings where key = 'terms'))
    returning id, ref into v_id, v_ref;

  select array_agg(id) into v_admins from profiles where role = 'admin';
  if v_admins is not null then
    perform queue_notice_many(v_admins, 'staff', 'Mechanic inspection asked for: ' || v_ref,
      trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) || ' would like our mechanic to inspect the ' || l.title
      || ' (' || coalesce(l.suburb, '') || ', ' || coalesce(l.state, '') || '). Agree a time with the owner and the mechanic, then book it in '
      || 'Admin → Viewings: that sends the member the amount to pay.', '/admin/viewings', 'inspection-ask:' || v_id);
  end if;
  return jsonb_build_object('id', v_id, 'ref', v_ref, 'fee', v_fee);
end $$;
revoke execute on function public.request_inspection(bigint, jsonb, text, boolean) from public, anon;
grant execute on function public.request_inspection(bigint, jsonb, text, boolean) to authenticated, service_role;

-- The member cancels: free before it's paid, a full refund until 24 hours before the booked time.
create or replace function public.cancel_inspection(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid()); v record; v_refund numeric; v_admins uuid[];
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select i.*, l.title, l.state lot_state into v from mechanic_inspections i join lots l on l.id = i.lot_id
    where i.id = p_id and i.user_id = v_uid for update of i;
  if not found then raise exception 'inspection_not_found'; end if;
  if v.status not in ('requested', 'booked', 'paid') then raise exception 'inspection_not_open'; end if;
  if v.status = 'paid' and v.starts_at <= now() + interval '24 hours' then raise exception 'inspection_too_late'; end if;
  v_refund := case when v.status = 'paid' then v.fee end;
  update mechanic_inspections set status = 'cancelled', refund_due = v_refund, staff_note = 'You cancelled it.', status_at = now()
    where id = p_id;
  select array_agg(id) into v_admins from profiles where role = 'admin';
  if v_admins is not null then
    perform queue_notice_many(v_admins, 'staff', 'Inspection cancelled: ' || v.ref,
      'The member cancelled ' || v.ref || ' for the ' || v.title
      || case when v_refund is not null then '. Refund $' || to_char(v_refund, 'FM999,999,990.00') || ' to the account they paid from, then mark it refunded in Admin → Viewings.'
              when v.status = 'booked' then '. Let the mechanic know it''s off.' else '.' end,
      '/admin/viewings', 'inspection-cancel:' || p_id);
  end if;
  if v.status in ('booked', 'paid') then
    perform queue_seller_notice(v.lot_id, 'Inspection cancelled: ' || v.title,
      'The mechanic''s visit for ' || local_when(v.starts_at, v.lot_state) || ' is off. Nobody will come.', '/sell/dashboard',
      'inspection-off:' || p_id);
  end if;
  return jsonb_build_object('refund', v_refund);
end $$;
revoke execute on function public.cancel_inspection(uuid) from public, anon;
grant execute on function public.cancel_inspection(uuid) to authenticated, service_role;

-- Staff: book a time (the member is sent the amount to pay; the owner the time), record the payment, close it with the
-- report (only once the listing shows what was found), decline, cancel (a refund if paid), or record the refund.
create or replace function public.admin_inspection(p_id uuid, p_action text, p_starts timestamptz default null,
  p_mechanic text default null, p_note text default null, p_report text default null, p_summary text default null,
  p_faults boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare v record; v_when text; v_sale timestamptz; v_pay_by timestamptz; v_refund numeric; v_fee text;
begin
  if not (select public.is_admin()) and coalesce((select auth.role()), '') <> 'service_role' then raise exception 'forbidden'; end if;
  select i.*, l.title, l.suburb, l.state lot_state, l.status lot_status, l.live_state, l.sale_id, l.ends_at lot_ends into v
    from mechanic_inspections i join lots l on l.id = i.lot_id where i.id = p_id for update of i;
  if not found then raise exception 'inspection_not_found'; end if;
  v_fee := '$' || to_char(v.fee, 'FM999,999,990');

  if p_action = 'book' then
    if v.status not in ('requested', 'booked') then raise exception 'inspection_not_open'; end if;
    if v.lot_status not in ('live', 'scheduled') or coalesce(v.live_state, 'waiting') <> 'waiting' then raise exception 'inspection_closed'; end if;
    if p_starts is null or p_starts < now() + interval '12 hours' then raise exception 'inspection_time'; end if;
    select starts_at into v_sale from sales where id = v.sale_id and mode = 'live';
    if p_starts > coalesce(v_sale, v.lot_ends) - interval '2 hours' then raise exception 'inspection_after_auction'; end if;
    if char_length(coalesce(trim(p_mechanic), '')) < 2 then raise exception 'inspection_mechanic'; end if;
    if not exists (select 1 from lot_private where lot_id = v.lot_id and coalesce(trim(seller_address), '') <> '') then
      raise exception 'inspection_no_address';
    end if;
    -- a day before the visit to pay, but at least six hours from now and never later than three hours before it
    v_pay_by := least(greatest(now() + interval '6 hours', p_starts - interval '24 hours'), p_starts - interval '3 hours');
    update mechanic_inspections set status = 'booked', starts_at = p_starts, mechanic = left(trim(p_mechanic), 120), pay_by = v_pay_by,
      staff_note = null, reminded_at = null, status_at = now() where id = p_id;
    v_when := local_when(p_starts, v.lot_state);
    perform queue_notice(v.user_id, 'account', 'Inspection booked: ' || v.title,
      'Our mechanic, ' || trim(p_mechanic) || ', inspects it where it''s kept on ' || v_when || '. You don''t need to be there. Please pay '
      || v_fee || ' (including GST) by bank transfer with the reference ' || v.ref || ' by ' || local_when(v_pay_by, v.lot_state)
      || ': our bank details are with your booking on the listing. If it isn''t paid by then, the booking lapses. '
      || 'The report comes to you, usually by the end of the next business day.',
      '/lot/' || v.lot_id || '#inspect', 'inspection-book:' || p_id || ':' || extract(epoch from p_starts)::bigint);
    perform queue_seller_notice(v.lot_id, 'Mechanic inspection booked: ' || v.title,
      'Our mechanic, ' || trim(p_mechanic) || ', is coming on ' || v_when || ' to inspect it for a bidder (booking ' || v.ref || '). '
      || 'Please have it where it''s kept, with the keys. They''ll look it over, start it and run it, and look underneath where it''s safe to: '
      || 'no road test, and nothing taken apart. We''ll tell you what they find. Can''t do that time? Call us straight away.',
      '/sell/dashboard', 'inspection-seller:' || p_id || ':' || extract(epoch from p_starts)::bigint);

  elsif p_action = 'paid' then
    if v.status <> 'booked' then raise exception 'inspection_not_booked'; end if;
    update mechanic_inspections set status = 'paid', paid_at = now(), paid_note = left(nullif(trim(p_note), ''), 200), status_at = now()
      where id = p_id;
    perform queue_notice(v.user_id, 'account', 'Paid: your inspection of the ' || v.title,
      'Thanks: we''ve received ' || v_fee || ' for inspection ' || v.ref || '. Our mechanic goes on ' || local_when(v.starts_at, v.lot_state)
      || '. Your tax invoice is with the booking on the listing.', '/lot/' || v.lot_id || '#inspect', 'inspection-paid:' || p_id);

  elsif p_action = 'done' then
    if v.status <> 'paid' then raise exception 'inspection_not_paid'; end if;
    if coalesce(p_report, '') !~ ('^bookings/' || p_id::text || '/[A-Za-z0-9._-]+$') then raise exception 'inspection_report'; end if;
    if char_length(coalesce(trim(p_summary), '')) < 20 then raise exception 'inspection_summary'; end if;
    if not coalesce(p_faults, false) then raise exception 'inspection_faults_listed'; end if;
    update mechanic_inspections set status = 'done', report_path = p_report, summary = left(trim(p_summary), 2000), faults_listed = true,
      done_at = now(), status_at = now() where id = p_id;
    perform queue_notice(v.user_id, 'account', 'Your inspection report: ' || v.title,
      left(trim(p_summary), 400) || case when char_length(trim(p_summary)) > 400 then '…' else '' end
      || ' The full report is with your booking on the listing.', '/lot/' || v.lot_id || '#inspect', 'inspection-done:' || p_id);
    perform queue_seller_notice(v.lot_id, 'Inspection done: ' || v.title,
      'What our mechanic found: ' || left(trim(p_summary), 600) || case when char_length(trim(p_summary)) > 600 then '…' else '' end
      || ' Anything that needs attention is now on the listing, so every bidder sees it.', '/sell/dashboard', 'inspection-seller-done:' || p_id);

  elsif p_action in ('decline', 'cancel') then
    if v.status not in ('requested', 'booked', 'paid') then raise exception 'inspection_not_open'; end if;
    if p_action = 'decline' and v.status = 'paid' then raise exception 'inspection_paid_cancel'; end if;
    v_refund := case when v.status = 'paid' then v.fee end;
    update mechanic_inspections set status = case when p_action = 'decline' then 'declined' else 'cancelled' end, refund_due = v_refund,
      staff_note = left(nullif(trim(p_note), ''), 500), status_at = now() where id = p_id;
    perform queue_notice(v.user_id, 'account',
      case when p_action = 'decline' then 'We couldn''t book your inspection' else 'Your inspection is cancelled' end,
      'For the ' || v.title || ': ' || coalesce(nullif(trim(p_note), ''),
        case when p_action = 'decline' then 'we couldn''t find a time with the owner and our mechanic before the auction.'
             else 'the mechanic can''t go as booked.' end)
      || case when v_refund is not null then ' We''ll refund your ' || v_fee || ' to the account you paid from within 2 business days.' else '' end
      || ' You can still inspect it yourself: book a viewing on the listing.',
      '/lot/' || v.lot_id || '#inspect', 'inspection-' || p_action || ':' || p_id);
    if v.status in ('booked', 'paid') then
      perform queue_seller_notice(v.lot_id, 'Inspection cancelled: ' || v.title,
        'The mechanic''s visit for ' || local_when(v.starts_at, v.lot_state) || ' is off. Nobody will come.', '/sell/dashboard',
        'inspection-off:' || p_id);
    end if;

  elsif p_action = 'refunded' then
    if coalesce(v.refund_due, 0) <= 0 or v.refunded_at is not null then raise exception 'inspection_no_refund'; end if;
    update mechanic_inspections set refunded_at = now() where id = p_id;
    perform queue_notice(v.user_id, 'account', 'Refund sent: inspection ' || v.ref,
      '$' || to_char(v.refund_due, 'FM999,999,990') || ' is on its way back to the account you paid from.',
      '/lot/' || v.lot_id || '#inspect', 'inspection-refunded:' || p_id);
  else
    raise exception 'inspection_action';
  end if;
end $$;
revoke execute on function public.admin_inspection(uuid, text, timestamptz, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_inspection(uuid, text, timestamptz, text, text, text, text, boolean) to authenticated, service_role;

-- The clock: a booking not paid in time lapses, the owner is reminded shortly before, and a booking for a vehicle that's
-- no longer open is cancelled (refunded if paid and the visit hasn't happened).
create or replace function public.inspection_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare v record; n int := 0; v_admins uuid[];
begin
  for v in select i.*, l.title, l.state lot_state from mechanic_inspections i join lots l on l.id = i.lot_id
           where i.status = 'booked' and i.pay_by < now() order by i.pay_by limit 200 for update of i skip locked loop
    update mechanic_inspections set status = 'cancelled', staff_note = 'It wasn''t paid in time.', status_at = now() where id = v.id;
    perform queue_notice(v.user_id, 'account', 'Your inspection booking lapsed',
      'We didn''t receive the $' || to_char(v.fee, 'FM999,999,990') || ' for inspection ' || v.ref || ' in time, so the mechanic won''t go. '
      || 'If you''ve just paid, call us and we''ll sort it out.', '/lot/' || v.lot_id || '#inspect', 'inspection-lapsed:' || v.id);
    perform queue_seller_notice(v.lot_id, 'Inspection cancelled: ' || v.title,
      'The mechanic''s visit for ' || local_when(v.starts_at, v.lot_state) || ' is off. Nobody will come.', '/sell/dashboard',
      'inspection-off:' || v.id);
    n := n + 1;
  end loop;

  for v in select i.*, l.title, l.state lot_state from mechanic_inspections i join lots l on l.id = i.lot_id
           where i.status = 'paid' and i.reminded_at is null and i.starts_at between now() and now() + interval '75 minutes'
           for update of i skip locked loop
    update mechanic_inspections set reminded_at = now() where id = v.id;
    perform queue_seller_notice(v.lot_id, 'Our mechanic is due soon: ' || v.title,
      'Our mechanic, ' || coalesce(v.mechanic, 'from Super Trucker') || ', is due at '
      || to_char(v.starts_at at time zone state_tz(v.lot_state), 'FMHH12:MI am') || ' (booking ' || v.ref || '). '
      || 'No road test, and nothing taken apart. Running late or can''t make it? Call us.', '/sell/dashboard', 'inspection-soon:' || v.id);
    n := n + 1;
  end loop;

  select array_agg(id) into v_admins from profiles where role = 'admin';
  for v in select i.*, l.title, l.state lot_state from mechanic_inspections i join lots l on l.id = i.lot_id
           where i.status in ('requested', 'booked', 'paid')
             and (l.status not in ('live', 'scheduled') or coalesce(l.live_state, 'waiting') <> 'waiting')
             and (i.status <> 'paid' or i.starts_at > now())
           limit 200 for update of i skip locked loop
    update mechanic_inspections set status = 'cancelled', refund_due = case when v.status = 'paid' then v.fee end,
      staff_note = 'The vehicle is no longer open for inspection.', status_at = now() where id = v.id;
    perform queue_notice(v.user_id, 'account', 'Inspection cancelled: ' || v.title,
      'The ' || v.title || ' is no longer open for inspection, so the mechanic won''t go.'
      || case when v.status = 'paid' then ' We''ll refund your $' || to_char(v.fee, 'FM999,999,990') || ' to the account you paid from within 2 business days.' else '' end,
      '/lot/' || v.lot_id, 'inspection-closed:' || v.id);
    if v.status in ('booked', 'paid') then
      perform queue_seller_notice(v.lot_id, 'Inspection cancelled: ' || v.title,
        'The mechanic''s visit for ' || local_when(v.starts_at, v.lot_state) || ' is off. Nobody will come.', '/sell/dashboard',
        'inspection-off:' || v.id);
    end if;
    if v.status = 'paid' and v_admins is not null then
      perform queue_notice_many(v_admins, 'staff', 'Refund due: inspection ' || v.ref,
        'The ' || v.title || ' closed before the inspection. Refund $' || to_char(v.fee, 'FM999,999,990.00')
        || ' to the account the member paid from, then mark it refunded in Admin → Viewings.', '/admin/viewings', 'inspection-refund:' || v.id);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.inspection_sweep() from public, anon, authenticated;
grant execute on function public.inspection_sweep() to service_role;

-- A member with a mechanic booked, or a refund for one still to come, can't delete their account yet.
create or replace function public.account_deletion_blockers(p_user uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when exists (select 1 from max_bids m join lots l on l.id = m.lot_id where m.bidder_id = p_user and l.status = 'live')
      then 'You have bids on vehicles that are still live. Bids can''t be withdrawn, so wait until those auctions end.' end,
    case when exists (select 1 from lots l where l.leader_id = p_user and l.status = 'referred')
      then 'Your bid is with a seller for a decision.' end,
    case when exists (select 1 from offers o join lots l on l.id = o.lot_id where o.user_id = p_user and o.status = 'pending' and l.status = 'offers')
      then 'You have an offer waiting on a seller.' end,
    case when exists (select 1 from invoices i where i.buyer_id = p_user and i.status <> 'cancelled' and (i.status <> 'paid' or i.collected_at is null))
      then 'You have a purchase that isn''t fully paid for and collected yet.' end,
    case when exists (select 1 from claims c where c.buyer_id = p_user and c.status = 'open')
      then 'You have an open claim.' end,
    case when exists (select 1 from lots l where l.seller_id = p_user and l.status in ('draft', 'scheduled', 'live', 'referred', 'offers'))
      then 'You have a vehicle for sale with us.' end,
    case when exists (select 1 from seller_payouts s where s.seller_id = p_user and s.status not in ('paid', 'cancelled'))
      then 'You have a seller payout still to come.' end,
    case when exists (select 1 from bidder_deposits d where d.user_id = p_user and d.kind = 'withdrawal' and d.status = 'pending')
      then 'Your deposit refund is still on its way.' end,
    case when (select coalesce(sum(amount), 0) from bidder_deposits d where d.user_id = p_user and d.status <> 'cancelled') > 0
      then 'You have a bidding deposit with us. Withdraw it first (Account → Bidding deposit).' end,
    case when exists (select 1 from mechanic_inspections i where i.user_id = p_user
                        and (i.status in ('booked', 'paid') or (coalesce(i.refund_due, 0) > 0 and i.refunded_at is null)))
      then 'You have a mechanic inspection booked, or a refund for one still to come.' end
  ], null)
$$;
revoke execute on function public.account_deletion_blockers(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_blockers(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Passed in below the reserve: one of our sales consultants is in touch, and nothing is promised in between
-- ---------------------------------------------------------------------------
-- The words the highest bidder reads when it's passed in: the room shows the same (passedInTop()).
create or replace function public.passed_in_top_text() returns text
language sql immutable as $$
  select 'That''s below the seller''s reserve, so it''s passed in: it isn''t sold, and you don''t owe anything. '
    || 'One of our sales consultants will be in touch about it, including whether it''ll be offered at a later auction.';
$$;

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
        case when l.collect_from = 'seller'
          then 'The buyer pays us first. Once it''s paid they book a time to collect it from you, which we agree with you. Hand it over only on the release code, and never take money from anyone: if someone contacts you about it, tell us.'
          else 'The buyer pays us first. Once it''s paid, our transport partner will call you to book the pickup. Never hand it to anyone else or take money from anyone: if someone contacts you about it, tell us.' end,
        '/sell/dashboard', 'seller-sold:' || l.id);
    elsif l.status = 'passed' and not exists (select 1 from invoices where lot_id = l.id) then
      -- into the next auction first, so the seller hears when (a failure here leaves it for staff to relist by hand)
      begin
        v_plan := relist_auto(l.id);
      exception when others then
        v_plan := null;
      end;
      if l.leader_id is not null and l.bid_count > 0 then
        -- word for word with passedInTop() in src/lib/estimate.ts, after the amount
        perform queue_notice(l.leader_id, 'account', 'You were the highest bidder on the ' || l.title,
          'Bidding reached $' || to_char(l.current_bid, 'FM999,999,990') || '. ' || passed_in_top_text(), '/lot/' || l.id, 'passed-top:' || l.id);
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


-- ---------------------------------------------------------------------------
-- 5. New Terms and seller agreement: members accept them again before they bid
-- ---------------------------------------------------------------------------
update public.settings set value = value || '{"buyer_version":"2026-11-17","seller_version":"2026-11-17"}'::jsonb where key = 'terms';
