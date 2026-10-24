-- The live room, from the bidder's side (found by running a sample auction end to end, desktop and phone):
--
--  * The sale starts at its published time, never earlier. The Terms (section 6) offer every vehicle "at a published
--    start time"; starting early would sell vehicles while bidders who planned around that time are still on their
--    way. The clock already waited for it (live_sweep); now the auctioneer's console does too.
--  * Once the sale is running, the times shown for the vehicles still to come are worked out from now (or the end of
--    the vehicle that's up), not from the advertised start.
--  * The hammer is a moment everyone sees. When the countdown runs out, the console knocks the vehicle down with
--    admin_live_due, which only closes it if the countdown really has run out (a bid that has just reset it keeps the
--    vehicle open, so everyone still gets the time to answer). The room then shows the result for a few seconds before
--    the next vehicle: before, the console closed it and offered the next in one step, so nobody saw the result, and
--    the auctioneer's last call ("Fair warning") stayed up after the hammer when it was knocked down by hand.

-- ---------------------------------------------------------------------------
-- 1. Never before the published start time
-- ---------------------------------------------------------------------------
create or replace function public.admin_live_start(p_sale bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype;
begin
  perform live_admin_ok();
  select * into s from sales where id = p_sale for update;
  if not found then raise exception 'sale_not_found'; end if;
  if s.mode <> 'live' then raise exception 'not_live_sale'; end if;
  if not s.published then raise exception 'sale_hidden:publish the sale first'; end if;
  if s.live_status <> 'scheduled' then raise exception 'sale_started:this sale has already started'; end if;
  if char_length(trim(coalesce(s.auctioneer, ''))) < 3 then
    raise exception 'auctioneer_needed:add the auctioneer''s name first (it''s shown to bidders for the whole auction)';
  end if;
  if s.starts_at is not null and s.starts_at > now() then
    raise exception 'sale_early:it''s advertised to start at %, so it can''t start before then',
      to_char(s.starts_at at time zone 'Australia/Brisbane', 'FMHH12:MI am "on" FMDay FMDD FMMonth "(Brisbane time)"');
  end if;
  return live_advance(p_sale, null);
end $$;
revoke execute on function public.admin_live_start(bigint) from public, anon;
grant execute on function public.admin_live_start(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Estimated times for the vehicles still waiting: from the advertised start until it starts, then from now
-- ---------------------------------------------------------------------------
create or replace function public.live_estimates(p_sale bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype; v_base timestamptz;
begin
  select * into s from sales where id = p_sale;
  if not found or s.mode <> 'live' then return; end if;
  v_base := greatest(case when s.live_status in ('running','paused') then now() else coalesce(s.starts_at, now()) end, now(),
    coalesce((select ends_at from lots where id = s.current_lot_id and live_state = 'open'), now()));
  with w as (
    select id, row_number() over (order by sale_order nulls last, id) rn from lots
     where sale_id = p_sale and live_state = 'waiting' and status in ('draft','scheduled','live')
  )
  update lots l set ends_at = greatest(v_base + make_interval(secs => (w.rn * (s.lot_seconds + 20))::int), now() + interval '2 minutes'), updated_at = now()
    from w where l.id = w.id and l.ends_at is distinct from greatest(v_base + make_interval(secs => (w.rn * (s.lot_seconds + 20))::int), now() + interval '2 minutes');
end $$;
revoke execute on function public.live_estimates(bigint) from public, anon, authenticated;
grant execute on function public.live_estimates(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The countdown has run out: knock it down (the console calls this at zero). Null when it isn't due yet.
-- ---------------------------------------------------------------------------
create or replace function public.admin_live_due(p_sale bigint) returns text
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype;
begin
  perform live_admin_ok();
  select * into s from sales where id = p_sale;
  if not found or s.mode <> 'live' or s.live_status <> 'running' or s.current_lot_id is null then return null; end if;
  -- the vehicle's row first, as a bid takes it: a bid that got in first has reset the countdown, so it isn't due
  perform 1 from lots where id = s.current_lot_id and status = 'live' and live_state = 'open' and ends_at <= now() for update;
  if not found then return null; end if;
  return close_one_lot(s.current_lot_id);
end $$;
revoke execute on function public.admin_live_due(bigint) from public, anon;
grant execute on function public.admin_live_due(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The auctioneer's call after the hammer: the result, whoever closed it (the console, the clock, the end of the sale)
-- ---------------------------------------------------------------------------
create or replace function public.live_lot_hammer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- never waits on the sale: if something else holds it (the console's next step), that step sets the call itself
  perform 1 from sales where id = new.sale_id and mode = 'live' and current_lot_id = new.id and live_status in ('running','paused')
    for update skip locked;
  if found then
    update sales set live_message = case
        when new.status = 'sold' then 'Sold!'
        when new.status = 'passed' and new.bid_count > 0 then 'Passed in: below the reserve.'
        when new.status = 'passed' then 'Passed in: no bids.'
        when new.status = 'offers' then 'Passed in: open to offers.'
        else 'Bidding has closed.' end,
      live_message_at = now(), updated_at = now()
     where id = new.sale_id;
  end if;
  return null;
end $$;
revoke execute on function public.live_lot_hammer() from public, anon, authenticated;
drop trigger if exists live_lot_hammer on public.lots;
create trigger live_lot_hammer after update of live_state on public.lots for each row
  when (old.live_state = 'open' and new.live_state = 'closed' and new.sale_id is not null)
  execute function public.live_lot_hammer();
