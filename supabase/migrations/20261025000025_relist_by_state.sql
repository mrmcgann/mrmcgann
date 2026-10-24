-- Tyrebiter: a vehicle that doesn't sell at auction is relisted for the next one, state by state.
--
-- Every vehicle is sold under the hammer, in every state (in Victoria a consigned vehicle can only be sold that way), so
-- nothing is sold after the auction: a vehicle passed in below its reserve, with no bids, or not offered before the sale
-- finished goes into the next live auction instead. As soon as it's passed in we copy it to a draft (a fresh PPSR search,
-- listing checks and estimate are needed before it can go live) and put it in the next published live auction for its
-- state that starts at least 2 days later and before the seller's authority to sell ends (90 days from signing). The
-- seller is told, and can say no (free) until it's listed. The consultant gets the steps. The state's own rules are
-- checked when it's published, against the new auction's date: the Victorian roadworthy certificate (less than 30 days
-- old), the Queensland safety certificate (2 months), and now the seller's 90-day authority in every state.
--
-- 1. relist_core / admin_relist, relist_auto, relist_seller_text, queue_staff_email
-- 2. queue_passed_followup (with the relist), queue_status_notices and live_pass_unoffered (relist on the way out;
--    a sale cancelled after the hammer no longer gets the passed-in notices)
-- 3. The seller says no: seller_decline_relist / admin_decline_relist -> relist_decline_core
-- 4. lot_publish_check: the auction must fall within the seller's 90-day authority
-- 5. notify_relisted_live: live-auction wording; its watchers keep watching the new listing

-- ---------------------------------------------------------------------------
-- 1. Relisting
-- ---------------------------------------------------------------------------
-- why a vehicle was passed in, where it isn't plain from its bids: the auction finished before it was offered (its
-- early bids lapsed). Public, so the listing and the seller's dashboard say so instead of "below the reserve".
alter table public.lots add column if not exists not_offered boolean not null default false;

alter table public.seller_decisions drop constraint if exists seller_decisions_action_check;
alter table public.seller_decisions add constraint seller_decisions_action_check
  check (action in ('accept_referral','decline_referral','accept_offer','decline_offer','lower_reserve','remove_reserve','decline_relist'));

-- The copy itself (migration 22's admin_relist, without the permission check): a fresh draft that doesn't carry the old
-- sale, its place in it, its locked fees, its PPSR result and listing checks, or its estimate.
create or replace function public.relist_core(p_lot bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare l lots%rowtype; v_new bigint; cols text;
  skip text[] := array['id','status','current_bid','bid_count','leader_id','starts_at','ends_at','decision_by','winner_id','sold_price',
    'sold_via','created_at','updated_at','featured','notified_status','published_at','views','relisted_from','corrected_at','reserve_met',
    'verified','verified_at','ppsr_checked_at','ppsr_cert_no','sale_id','sale_order','live_state','extend_seconds','fees','tender_count',
    'estimate_low','estimate_high','not_offered'];
begin
  select * into l from lots where id = p_lot;
  if not found then raise exception 'lot_not_found'; end if;
  if l.status not in ('passed','cancelled') then raise exception 'not_relistable:only a vehicle that didn''t sell, or whose sale was cancelled, can be relisted'; end if;
  if exists (select 1 from lots where relisted_from = p_lot and status <> 'cancelled') then raise exception 'already_relisted:this vehicle has already been relisted'; end if;
  v_new := nextval('lot_number_seq');
  select string_agg(quote_ident(attname), ', ' order by attnum) into cols from pg_attribute
   where attrelid = 'public.lots'::regclass and attnum > 0 and not attisdropped and attgenerated = '' and attname <> all (skip);
  execute format('insert into public.lots (id, status, relisted_from, reserve_met, %1$s) select $1, ''draft'', $2, not has_reserve, %1$s from public.lots where id = $2', cols)
    using v_new, p_lot;
  perform copy_lot_rows('lot_private', p_lot, v_new, array['seller_invite','leader_max','leader_max_at','estimate_basis','estimate_by','estimate_at']);
  perform copy_lot_rows('lot_photos', p_lot, v_new, array['id','created_at']);
  perform copy_lot_rows('lot_flaws', p_lot, v_new, array['id']);
  perform copy_lot_rows('lot_videos', p_lot, v_new, array['id','created_at'], 'status = ''approved''');
  perform copy_lot_rows('seller_agreements', p_lot, v_new, array['id'], 'status = ''signed''');
  return v_new;
end $$;
revoke execute on function public.relist_core(bigint) from public, anon, authenticated;
grant execute on function public.relist_core(bigint) to service_role;

create or replace function public.admin_relist(p_lot bigint) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  return relist_core(p_lot);
end $$;
revoke execute on function public.admin_relist(bigint) from public, anon;
grant execute on function public.admin_relist(bigint) to authenticated, service_role;

-- A vehicle just passed in (or not offered) goes back in: copied to a draft and put in the next published live auction
-- for its state, at least 2 days away and inside the seller's 90-day authority. Returns the plan (or null when it isn't
-- relisted: not live-only, a sale cancelled after the hammer, already relisted, or the seller said no).
create or replace function public.relist_auto(p_lot bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l lots%rowtype; v_new bigint; v_end timestamptz; v_sale bigint; v_title text; v_at timestamptz;
begin
  if not live_only() then return null; end if;
  select * into l from lots where id = p_lot;
  if not found or l.status <> 'passed' then return null; end if;
  -- a sale cancelled after the hammer also ends 'passed': staff decide what happens to those
  if exists (select 1 from invoices where lot_id = p_lot) then return null; end if;
  if exists (select 1 from lots where relisted_from = p_lot)
     or exists (select 1 from seller_decisions where lot_id = p_lot and action = 'decline_relist') then return null; end if;
  v_new := relist_core(p_lot);
  select max(signed_at) + interval '90 days' into v_end from seller_agreements where lot_id = v_new and status = 'signed';
  select s.id, s.title, s.starts_at into v_sale, v_title, v_at from sales s
   where s.mode = 'live' and s.published and s.live_status = 'scheduled'
     and s.starts_at >= now() + interval '2 days'
     and (coalesce(s.state, '') = '' or coalesce(l.state, '') = '' or upper(s.state) = upper(l.state))   -- a sale for several states takes any
     and (v_end is null or s.starts_at < v_end)
   order by s.starts_at limit 1;
  if v_sale is not null then update lots set sale_id = v_sale where id = v_new; end if;
  return jsonb_build_object('lot', v_new, 'sale_id', v_sale, 'sale', v_title, 'starts_at', v_at, 'authority_ends', v_end);
end $$;
revoke execute on function public.relist_auto(bigint) from public, anon, authenticated;
grant execute on function public.relist_auto(bigint) to service_role;

-- What the seller is told happens next (one place, so the pass-in and not-offered notices say the same).
create or replace function public.relist_seller_text(p jsonb) returns text
language sql stable set search_path = public as $$
  select case
    when p is null then 'We''ll call you about offering it again at a later auction, with or without a lower reserve.'
    else case when p->>'sale_id' is not null
           then 'We''re offering it again in our live auction on ' || to_char((p->>'starts_at')::timestamptz at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth, FMHH12:MI am') || ' (Brisbane time). '
           else 'We''re offering it again at our next live auction, and we''ll tell you the date. ' end
      || 'Your consultant will call you to agree the reserve (you can lower it). Don''t want it offered again? Tell us from your seller dashboard before it''s listed: there''s no fee.'
  end
$$;
revoke execute on function public.relist_seller_text(jsonb) from public, anon, authenticated;
grant execute on function public.relist_seller_text(jsonb) to service_role;

-- An email to the listing's consultant, or (with none) up to 10 admins.
create or replace function public.queue_staff_email(p_lot bigint, p_title text, p_body text, p_link text, p_dedupe text) returns int
language plpgsql security definer set search_path = public as $$
declare l record; v_to text; a record; n int := 0;
begin
  select id, consultant_id into l from lots where id = p_lot;
  select nullif(trim(email), '') into v_to from consultants
   where active and (id = l.consultant_id or (l.consultant_id is null and is_default)) order by (id = l.consultant_id) desc limit 1;
  if v_to is not null then
    insert into outbox (channel, to_addr, kind, title, body, link, dedupe_key, priority)
      values ('email', v_to, 'staff', p_title, p_body, p_link, p_dedupe, 2) on conflict (dedupe_key) do nothing;
    return 1;
  end if;
  for a in select id, email from profiles where role = 'admin' and email is not null order by id limit 10 loop
    insert into outbox (user_id, channel, to_addr, kind, title, body, link, dedupe_key, priority)
      values (a.id, 'email', a.email, 'staff', p_title, p_body, p_link, p_dedupe || ':' || a.id, 2) on conflict (dedupe_key) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_staff_email(bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function public.queue_staff_email(bigint, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. The follow-up for the consultant: what happened, the highest bidder (if any), the relist and its steps
-- ---------------------------------------------------------------------------
drop function if exists public.queue_passed_followup(bigint);
create or replace function public.queue_passed_followup(p_lot bigint, p_why text default 'passed') returns int
language plpgsql security definer set search_path = public as $$
declare l record; b record; v_reserve numeric; v_sale text; v_head text; v_title text; v_body text; d record; v_end timestamptz;
  v_cert text; v_state text; v_relist text; v_top boolean;
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
  v_body := v_body || v_relist || case when v_top then ' Nothing can be sold after the auction: once the new listing is live, the bidder can leave an early bid on it.' else '' end;
  return queue_staff_email(p_lot, v_title, v_body, '/admin/lots/' || coalesce(case when d.status = 'draft' then d.id end, p_lot), 'passed-followup:' || p_lot);
end $$;
revoke execute on function public.queue_passed_followup(bigint, text) from public, anon, authenticated;
grant execute on function public.queue_passed_followup(bigint, text) to service_role;

-- The notices when a vehicle closes (migration 24's), now with the relist: a vehicle passed in goes into the next
-- auction straight away and the seller hears when. A sale cancelled after the hammer (its lot goes back to 'passed') sent
-- its own notices with the cancellation, so it gets none of these.
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
          '. Similar vehicles are listed every week.', '/auctions?cat=' || l.category, 'lost:' || l.id);
      end if;
      perform queue_seller_notice(l.id, 'Sold: your ' || l.title || ' for $' || to_char(l.sold_price, 'FM999,999,990'),
        'Congratulations. The buyer pays us first. Once it''s paid, our transport partner will call you to book the pickup. Never hand it to anyone else or take money from anyone: if someone contacts you about it, tell us.',
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
        relist_seller_text(v_plan), '/sell/dashboard', 'seller-passed:' || l.id);
    end if;
    update lots set notified_status = l.status where id = l.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_status_notices(int) from public, anon, authenticated;
grant execute on function public.queue_status_notices(int) to service_role;

-- What the auction didn't reach is passed in (migration 22's), and goes into the next auction the same way.
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
      'The auction finished before it was offered, so nothing was sold. ' || relist_seller_text(v_plan), '/sell/dashboard', 'seller-not-offered:' || r.id);
    perform queue_passed_followup(r.id, 'not_offered');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.live_pass_unoffered(bigint) from public, anon, authenticated;
grant execute on function public.live_pass_unoffered(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The seller says no: the draft is cancelled (free while it's a draft: it isn't listed yet), the decision recorded,
--    and the consultant told. Once the relisted vehicle is live, taking it out is a withdrawal (seller agreement s 8).
-- ---------------------------------------------------------------------------
create or replace function public.relist_decline_core(p_lot bigint, p_via text) returns bigint
language plpgsql security definer set search_path = public as $$
declare o lots%rowtype; d lots%rowtype;
begin
  select * into o from lots where id = p_lot for update;
  if not found then raise exception 'lot_not_found'; end if;
  if o.status = 'draft' and o.relisted_from is not null then   -- given the relist draft: the vehicle it came from
    select * into o from lots where id = o.relisted_from for update;
  end if;
  if o.status not in ('passed', 'cancelled') then
    raise exception 'not_unsold:only a vehicle that didn''t sell can be kept out of the next auction';
  end if;
  select * into d from lots where relisted_from = o.id and status <> 'cancelled' order by created_at desc limit 1 for update;
  if d.id is not null then
    if d.status <> 'draft' then
      raise exception 'relist_listed:it''s already listed in the next auction. To take it out, call us (seller agreement, section 8)';
    end if;
    update lots set status = 'cancelled', updated_at = now() where id = d.id;
  end if;
  if not exists (select 1 from seller_decisions where lot_id = o.id and action = 'decline_relist') then
    insert into seller_decisions (lot_id, seller_id, action, via) values (o.id, o.seller_id, 'decline_relist', p_via);
  end if;
  perform queue_staff_email(o.id, 'Not to be offered again: the ' || o.title,
    'The seller doesn''t want the ' || o.title || ' (lot ' || o.id || ') offered at another auction'
    || case when p_via = 'admin' then ' (recorded by staff).' else ' (they said so from their seller dashboard).' end
    || case when d.id is not null then ' Its relist draft, lot ' || d.id || ', has been cancelled.' else '' end || ' It stays theirs.',
    '/admin/lots/' || o.id, 'relist-declined:' || o.id);
  return o.id;
end $$;
revoke execute on function public.relist_decline_core(bigint, text) from public, anon, authenticated;
grant execute on function public.relist_decline_core(bigint, text) to service_role;

create or replace function public.seller_decline_relist(p_lot bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_seller uuid;
begin
  if (select auth.uid()) is null then raise exception 'not_signed_in'; end if;
  select seller_id into v_seller from lots where id = p_lot;
  if v_seller is null or v_seller <> (select auth.uid()) then raise exception 'forbidden'; end if;
  return relist_decline_core(p_lot, 'portal');
end $$;
revoke execute on function public.seller_decline_relist(bigint) from public, anon;
grant execute on function public.seller_decline_relist(bigint) to authenticated, service_role;

create or replace function public.admin_decline_relist(p_lot bigint) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return relist_decline_core(p_lot, 'admin');
end $$;
revoke execute on function public.admin_decline_relist(bigint) from public, anon;
grant execute on function public.admin_decline_relist(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Publishing: migration 22's checks, plus the seller's 90-day authority against the auction's date
-- ---------------------------------------------------------------------------
create or replace function public.lot_publish_check() returns trigger
language plpgsql set search_path = public as $$
declare v_req boolean; v_missing text[]; s public.sales%rowtype; v_basis text; v_cert text; v_day date; v_auth_end timestamptz; v_sale_at timestamptz;
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
begin
  if new.status in ('live','scheduled') and (tg_op = 'INSERT' or old.status = 'draft') then
    if current_user in ('authenticated','service_role','anon') then
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
-- 5. When a relisted vehicle goes live, everyone who bid on it or watched it last time hears when it's up, and its
--    watchers keep watching the new listing
-- ---------------------------------------------------------------------------
create or replace function public.notify_relisted_live() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_users uuid[]; s record;
begin
  if new.relisted_from is not null and new.status = 'live' and old.status is distinct from 'live' then
    insert into watchlist (user_id, lot_id, remind)
      select user_id, new.id, remind from watchlist where lot_id = new.relisted_from
      on conflict (user_id, lot_id) do nothing;
    select array_agg(distinct u) into v_users from (
      select bidder_id u from bids where lot_id = new.relisted_from
      union select bidder_id from max_bids where lot_id = new.relisted_from
      union select user_id from watchlist where lot_id = new.relisted_from) x where u is not null;
    if v_users is not null then
      select mode, starts_at into s from sales where id = new.sale_id;
      perform queue_notice_many(v_users, 'searches', 'Back for auction: ' || new.title,
        case when s.mode = 'live'
          then 'A vehicle you bid on or watched is back, in our live auction on ' || to_char(s.starts_at at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth, FMHH12:MI am')
               || ' (Brisbane time). Leave an early bid now, or bid in the live room when it''s up.'
          else 'A vehicle you bid on or watched is back for auction. Bidding ends ' || to_char(new.ends_at at time zone 'Australia/Brisbane', 'FMDy DD Mon, FMHH12:MI am') || ' (Brisbane time).' end,
        '/lot/' || new.id, 'relisted:' || new.id);
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 6. The seller agreement changes with it (offered again at the next live auction unless the seller says no, free until
--    it's listed; a fresh signature when the next auction is after the 90 days): new agreements record the new version
-- ---------------------------------------------------------------------------
update public.settings set value = coalesce(value, '{}'::jsonb) || '{"seller_version": "2026-10-25"}'::jsonb where key = 'terms';
