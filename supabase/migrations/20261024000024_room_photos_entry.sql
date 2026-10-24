-- The live room, as it will run (like Turners Live): no video stream, the vehicle's own photos and the seller's
-- walkaround video; the auction's conditions read and accepted before a bid in the room; and a vehicle passed in tells
-- its highest bidder that one of our consultants will be in touch.
--
--  * No stream: sales.stream_url stays empty (constraint sales_no_stream). The room shows the listing's photos and the
--    seller's video (lot_photos, lot_videos), so the website no longer lets any outside player in (CSP frame-src).
--  * Conditions of entry: before bidding in the live room a member reads the auction's conditions (src/lib/conditions.ts:
--    the key points of the Terms of Sale, in their words) and accepts them. enter_sale() records who, when and which
--    version of the terms; place_bid refuses a bid on the vehicle that's up from a member who hasn't (enter_first). Early
--    bids are placed from the listing, through its own confirm step, and floor bids by the auctioneer, so neither needs it.
--  * Passed in: the highest bidder is told "You were the highest bidder ... one of our consultants will be in touch", and
--    the listing's consultant (or, without one, the admins) gets the bidder's details by email. Nothing is sold after the
--    auction (Terms s 6), so the call is about the vehicle's next auction, where the bidder can leave an early bid.

-- ---------------------------------------------------------------------------
-- 1. No video stream
-- ---------------------------------------------------------------------------
update public.sales set stream_url = null where stream_url is not null;
alter table public.sales drop constraint if exists sales_no_stream;
alter table public.sales add constraint sales_no_stream check (stream_url is null);

-- ---------------------------------------------------------------------------
-- 2. The auction's conditions, accepted on entering the room
-- ---------------------------------------------------------------------------
create table if not exists public.sale_entries (
  sale_id bigint not null references public.sales(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  terms_version text,
  entered_at timestamptz not null default now(),       -- the first time they accepted
  last_entered_at timestamptz not null default now(),  -- the latest
  primary key (sale_id, user_id)
);
create index if not exists sale_entries_user on public.sale_entries (user_id);
alter table public.sale_entries enable row level security;
drop policy if exists sale_entries_read on public.sale_entries;
create policy sale_entries_read on public.sale_entries for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
-- written only by enter_sale()
revoke insert, update, delete on public.sale_entries from anon, authenticated;

create or replace function public.enter_sale(p_sale bigint) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid()); v_at timestamptz;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from sales where id = p_sale and mode = 'live' and published) then raise exception 'sale_not_found'; end if;
  insert into sale_entries (sale_id, user_id, terms_version)
    values (p_sale, v_uid, (select value ->> 'buyer_version' from settings where key = 'terms'))
  on conflict (sale_id, user_id) do update set terms_version = excluded.terms_version, last_entered_at = now()
  returning entered_at into v_at;
  return v_at;
end $$;
revoke execute on function public.enter_sale(bigint) from public, anon;
grant execute on function public.enter_sale(bigint) to authenticated, service_role;

-- A bid on the vehicle that's up comes from the room, after the conditions. (Early bids and floor bids don't come
-- through here: early bids are confirmed on the listing, and floor bids go through admin_floor_bid.)
create or replace function public.place_bid(p_lot bigint, p_max numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sale bigint;
begin
  select l.sale_id into v_sale from lots l join sales s on s.id = l.sale_id
   where l.id = p_lot and l.live_state = 'open' and s.mode = 'live';
  if v_sale is not null and not exists (select 1 from sale_entries where sale_id = v_sale and user_id = (select auth.uid())) then
    raise exception 'enter_first:read and accept the auction conditions in the live room before you bid there';
  end if;
  return place_bid_for(auth.uid(), p_lot, p_max, 'online');
end $$;
revoke execute on function public.place_bid(bigint, numeric) from public, anon;
grant execute on function public.place_bid(bigint, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Passed in: the highest bidder hears a consultant will be in touch, and the consultant gets their details
-- ---------------------------------------------------------------------------
create or replace function public.queue_passed_followup(p_lot bigint) returns int
language plpgsql security definer set search_path = public as $$
declare l record; b record; v_to text; v_reserve numeric; v_sale text; v_title text; v_body text; a record; n int := 0;
begin
  select * into l from lots where id = p_lot;
  if not found or l.leader_id is null then return 0; end if;
  select first_name, last_name, email, mobile, deposit_ref into b from profiles where id = l.leader_id;
  select reserve_price into v_reserve from lot_private where lot_id = p_lot;
  select title into v_sale from sales where id = l.sale_id;
  select nullif(trim(email), '') into v_to from consultants
   where active and (id = l.consultant_id or (l.consultant_id is null and is_default)) order by (id = l.consultant_id) desc limit 1;
  v_title := 'Follow up: the ' || l.title || ' was passed in at $' || to_char(l.current_bid, 'FM999,999,990');
  v_body := 'Lot ' || coalesce(l.sale_order::text, l.id::text) || coalesce(' in ' || v_sale, '') || ' was passed in at $'
    || to_char(l.current_bid, 'FM999,999,990') || coalesce(', below the seller''s reserve of $' || to_char(v_reserve, 'FM999,999,990'), '') || '. '
    || 'The highest bidder was ' || trim(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')) || coalesce(' (bidder ' || b.deposit_ref || ')', '')
    || coalesce(', mobile ' || b.mobile, '') || coalesce(', email ' || b.email, '') || '. '
    || 'They''ve been told one of our consultants will be in touch. Nothing can be sold after the auction: if the seller will take less, '
    || 'lower the reserve and offer it at the next auction, where the bidder can leave an early bid.';
  if v_to is not null then
    insert into outbox (channel, to_addr, kind, title, body, link, dedupe_key, priority)
      values ('email', v_to, 'staff', v_title, v_body, '/admin/lots/' || l.id, 'passed-followup:' || l.id, 2)
      on conflict (dedupe_key) do nothing;
    return 1;
  end if;
  -- no consultant with an email: the admins follow it up
  for a in select id, email from profiles where role = 'admin' and email is not null order by id limit 10 loop
    insert into outbox (user_id, channel, to_addr, kind, title, body, link, dedupe_key, priority)
      values (a.id, 'email', a.email, 'staff', v_title, v_body, '/admin/lots/' || l.id, 'passed-followup:' || l.id || ':' || a.id, 2)
      on conflict (dedupe_key) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_passed_followup(bigint) from public, anon, authenticated;
grant execute on function public.queue_passed_followup(bigint) to service_role;

-- The notices when a vehicle closes (migration 22's, with the passed-in highest bidder told a consultant will call).
create or replace function public.queue_status_notices(p_limit int default 200) returns int
language plpgsql security definer set search_path = public as $$
declare l record; n int := 0; v_users uuid[]; v_when text;
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
          '. Similar vehicles are listed every week.', '/auctions?cat=' || l.category, 'lost:' || l.id);
      end if;
      perform queue_seller_notice(l.id, 'Sold: your ' || l.title || ' for $' || to_char(l.sold_price, 'FM999,999,990'),
        'Congratulations. The buyer pays us first. Once it''s paid, our transport partner will call you to book the pickup. Never hand it to anyone else or take money from anyone: if someone contacts you about it, tell us.',
        '/sell/dashboard', 'seller-sold:' || l.id);
    elsif l.status = 'passed' then
      if l.leader_id is not null and l.bid_count > 0 then
        perform queue_notice(l.leader_id, 'account', 'You were the highest bidder on the ' || l.title,
          'Bidding reached $' || to_char(l.current_bid, 'FM999,999,990') || ', below the seller''s reserve, so it wasn''t sold and you don''t owe anything. '
          || 'One of our consultants will be in touch.', '/lot/' || l.id, 'passed-top:' || l.id);
        perform queue_passed_followup(l.id);
      end if;
      select array_agg(bidder_id) into v_users from max_bids where lot_id = l.id and bidder_id is distinct from l.leader_id;
      if v_users is not null and l.bid_count > 0 then
        perform queue_notice_many(v_users, 'outbid', 'The ' || l.title || ' was passed in',
          'Bidding didn''t reach the seller''s reserve, so it wasn''t sold and nobody owes anything. If it''s offered again, it''ll be in a later auction: we''ll let you know.',
          '/lot/' || l.id, 'passed:' || l.id);
      end if;
      perform queue_seller_notice(l.id, 'Your ' || l.title || ' didn''t sell this time',
        case when l.bid_count > 0 then 'It was passed in at $' || to_char(l.current_bid, 'FM999,999,990') || ', below your reserve. ' else 'Nobody bid this time. ' end ||
        'We''ll call you about offering it again at a later auction, with or without a lower reserve.', '/sell/dashboard', 'seller-passed:' || l.id);
    end if;
    update lots set notified_status = l.status where id = l.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_status_notices(int) from public, anon, authenticated;
grant execute on function public.queue_status_notices(int) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The Terms of Sale change with it (no stream; the conditions on entry; the consultant's call): members accept the
--    new version before their next bid
-- ---------------------------------------------------------------------------
update public.settings set value = coalesce(value, '{}'::jsonb) || '{"buyer_version": "2026-10-24"}'::jsonb where key = 'terms';
