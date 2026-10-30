-- Public holidays by state, so a cooling-off period ends on the right day.
--
-- The bug this fixes: cooling_off_end() takes the state's time zone but asked public_holidays for the day with no
-- state filter, and that table held one global list seeded with Queensland's holidays. Queensland gives no
-- cooling-off period at all (a sale on consignment is exempt), so those dates never mattered; the states that do
-- give one -- New South Wales 2 business days, South Australia 3, the ACT 4 -- had none of their holidays in the
-- table. A cooling-off period could therefore be worked out to end on a day that was still a public holiday where
-- the buyer lives, and finish_after_offers() would make the sale and invoice them before their statutory right to
-- cancel had actually run out. The one-business-day margin in after_auction_rule() absorbs a single missed holiday
-- but not a cluster (Easter, or Christmas and Boxing Day), and the ACT's four days span the most calendar days.
--
-- public_holidays gains a state: '' means every state, otherwise the state's own code. Weekend dates are left out
-- on purpose -- both business-day functions skip Saturday and Sunday with extract(isodow) < 6, so a weekend
-- holiday row can never change a result.
--
-- Part-day holidays (Christmas Eve and New Year's Eve, which start at 6 or 7 pm in Queensland, South Australia and
-- the Northern Territory) are counted as whole non-business days. They are public holidays on that date, and the
-- only direction that carries legal risk is ending a cooling-off period too early, so the longer count is the safe
-- one.
--
-- Dates: Fair Work Ombudsman, "2027 public holidays"
-- (https://www.fairwork.gov.au/employment-conditions/public-holidays/2027-public-holidays), which compiles each
-- state's own declaration. Regional variation inside a state (the Royal Queensland Show is Brisbane only, Western
-- Australia's King's Birthday moves in some regions, New South Wales has local event days) is not modelled: a lot
-- carries a state, not a region. The margin covers it. See docs/legal-basis.md section 5.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
alter table public.public_holidays add column if not exists state text not null default '';

do $do$
begin
  if exists (select 1 from pg_constraint where conname = 'public_holidays_pkey'
               and conrelid = 'public.public_holidays'::regclass
               and (select count(*) from unnest(conkey)) = 1) then
    alter table public.public_holidays drop constraint public_holidays_pkey;
    alter table public.public_holidays add constraint public_holidays_pkey primary key (day, state);
  end if;
end $do$;

alter table public.public_holidays drop constraint if exists public_holidays_state;
alter table public.public_holidays add constraint public_holidays_state
  check (state in ('', 'QLD', 'NSW', 'VIC', 'WA', 'SA', 'TAS', 'ACT', 'NT'));

create index if not exists public_holidays_day_state on public.public_holidays (day, state);

-- The rows seeded in migration 5 were Queensland's, filed as if they were national. Move the Queensland-only ones
-- across, then replace 2027 with the full per-state set below. Christmas 2026 stays national: 25 December 2026 is a
-- Friday and 28 December the observed holiday, in every state.
update public.public_holidays set state = 'QLD'
 where state = '' and (name like '%(Qld)%' or name like '%Queensland Show%');
delete from public.public_holidays where day >= date '2027-01-01' and day <= date '2027-12-31';

insert into public.public_holidays (day, state, name) values
  ('2027-01-01','','New Year''s Day'),
  ('2027-01-26','','Australia Day'),
  ('2027-02-08','TAS','Royal Hobart Regatta (south)'),
  ('2027-03-01','WA','Labour Day'),
  ('2027-03-08','ACT','Canberra Day'),
  ('2027-03-08','SA','Adelaide Cup Day'),
  ('2027-03-08','TAS','Eight Hours Day'),
  ('2027-03-08','VIC','Labour Day'),
  ('2027-03-26','','Good Friday'),
  ('2027-03-29','','Easter Monday'),
  ('2027-04-26','ACT','Anzac Day'),
  ('2027-04-26','NSW','Anzac Day (additional)'),
  ('2027-04-26','NT','Anzac Day'),
  ('2027-04-26','QLD','Anzac Day'),
  ('2027-04-26','WA','Anzac Day (additional)'),
  ('2027-05-03','NT','May Day'),
  ('2027-05-03','QLD','Labour Day'),
  ('2027-05-31','ACT','Reconciliation Day'),
  ('2027-06-07','WA','Western Australia Day'),
  ('2027-06-14','ACT','King''s Birthday'),
  ('2027-06-14','NSW','King''s Birthday'),
  ('2027-06-14','NT','King''s Birthday'),
  ('2027-06-14','SA','King''s Birthday'),
  ('2027-06-14','TAS','King''s Birthday'),
  ('2027-06-14','VIC','King''s Birthday'),
  ('2027-08-02','NT','Picnic Day'),
  ('2027-08-11','QLD','Royal Queensland Show (Brisbane)'),
  ('2027-09-27','WA','King''s Birthday'),
  ('2027-10-04','ACT','Labour Day'),
  ('2027-10-04','NSW','Labour Day'),
  ('2027-10-04','QLD','King''s Birthday'),
  ('2027-10-04','SA','Labour Day'),
  ('2027-10-21','TAS','Royal Hobart Show (Hobart)'),
  ('2027-11-01','TAS','Recreation Day (north)'),
  ('2027-11-02','VIC','Melbourne Cup'),
  ('2027-12-24','NT','Christmas Eve (part-day)'),
  ('2027-12-24','QLD','Christmas Eve (part-day)'),
  ('2027-12-24','SA','Christmas Eve (part-day)'),
  ('2027-12-27','','Christmas Day (additional)'),
  ('2027-12-28','','Boxing Day (additional)'),
  ('2027-12-31','NT','New Year''s Eve (part-day)'),
  ('2027-12-31','SA','New Year''s Eve (part-day)')
on conflict (day, state) do update set name = excluded.name;

-- ---------------------------------------------------------------------------
-- 2. The business-day maths
-- ---------------------------------------------------------------------------

-- A cooling-off period counts business days where the buyer is, so it skips that state's holidays and the national
-- ones. The old three-argument version is dropped rather than wrapped: a call that forgets the state must fail
-- loudly, not quietly count Queensland's holidays against a New South Wales buyer.
drop function if exists public.cooling_off_end(timestamptz, int, text);

create or replace function public.cooling_off_end(p_from timestamptz, p_days int, p_tz text, p_state text)
returns timestamptz language plpgsql stable set search_path = public as $$
declare d date; n int := coalesce(p_days, 0); st text := upper(trim(coalesce(p_state, '')));
begin
  if n <= 0 then return null; end if;
  d := (p_from at time zone p_tz)::date;
  while n > 0 loop
    d := d + 1;
    if extract(isodow from d) < 6
       and not exists (select 1 from public_holidays h where h.day = d and (h.state = '' or h.state = st)) then
      n := n - 1;
    end if;
  end loop;
  return ((d + 1)::timestamp at time zone p_tz) - interval '1 second';
end $$;
revoke execute on function public.cooling_off_end(timestamptz, int, text, text) from public, anon;
grant execute on function public.cooling_off_end(timestamptz, int, text, text) to authenticated, service_role;

-- Our own business days are Brisbane's (the business and the auctions are run from Queensland), so this one counts
-- the national holidays and Queensland's. It sets payment due dates, the decision clock and the waits before an
-- invoice is cancelled -- never a buyer's cooling-off period, which is the function above.
create or replace function public.business_days_from(p_from timestamptz, p_days int) returns timestamptz
language plpgsql stable set search_path = public as $$
declare local_day date; added int := 0; cursor_ts timestamptz := p_from;
begin
  while added < p_days loop
    cursor_ts := cursor_ts + interval '1 day';
    local_day := (cursor_ts at time zone 'Australia/Brisbane')::date;
    if extract(isodow from local_day) < 6
       and not exists (select 1 from public_holidays h where h.day = local_day and h.state in ('', 'QLD')) then
      added := added + 1;
    end if;
  end loop;
  return cursor_ts;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The one caller, with the buyer's state
-- ---------------------------------------------------------------------------
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
  -- the buyer's cooling-off runs on their own state's business days, so the state goes with the time zone
  v_until := cooling_off_end(now(), coalesce((o.rule->>'cooling_days')::int, 0),
    coalesce(o.rule->>'tz', 'Australia/Brisbane'), coalesce(o.rule->>'state', o.state, ''));
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

-- ---------------------------------------------------------------------------
-- 4. Site health notices when the table runs out
-- ---------------------------------------------------------------------------
-- The table has to be topped up every year. Empty, it doesn't fail loudly: business days simply stop skipping
-- holidays, and a cooling-off period quietly ends a day or two early. So Site health counts what's left.
create or replace function public.holidays_ahead() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'days', (select count(*) from public_holidays where day >= current_date),
    'until', (select max(day) from public_holidays),
    'states', (select count(distinct state) from public_holidays where day >= current_date and state <> ''));
$$;
revoke execute on function public.holidays_ahead() from public, anon;
grant execute on function public.holidays_ahead() to authenticated, service_role;
