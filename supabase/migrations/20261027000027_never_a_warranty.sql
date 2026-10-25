-- Tyrebiter: we never give a statutory warranty. We sell every vehicle as its owner's agent; at auction none applies
-- (except the ACT's dealer's duty to repair, which isn't lifted for auctions), and a sale after the auction is the
-- dealer's private-treaty sale, which the NSW dealer guarantee, the WA, SA and ACT duty to repair and the Tasmanian and
-- NT warranties cover for an eligible vehicle even when the dealer sells it for its owner (and no contract can exclude
-- them). So:
-- 1. warranty_free_for(): whether a vehicle is clearly outside every statutory warranty or dealer's duty to repair in
--    its state (two years past the age limit, because the law counts from build, compliance or first registration, which
--    can come after the model year; or over the distance; or a kind the law doesn't cover). Unknown counts as covered.
--    Mirrored by warrantyFree() in src/lib/afterAuction.ts.
-- 2. after_auction_check(): a vehicle one would cover can't be sold after the auction ('warranty'; 'warranty_unknown'
--    without its year). So the seller's dashboard, their pass-in notice and the consultant's follow-up say so too.
-- 3. admin_after_offer(): every offer is made without one (staff confirm none applies, from the vehicle's papers).
-- 4. lot_publish_check(): never a listing with a statutory warranty, and in the ACT never a vehicle its duty to repair
--    could cover (it applies even at auction there).
-- 5. New versions of the Terms of Sale and the seller agreement.

-- ---------------------------------------------------------------------------
-- 1. Is the vehicle clearly outside every statutory warranty in its state?
-- ---------------------------------------------------------------------------
create or replace function public.warranty_free_for(p_state text, p_year int, p_odometer numeric, p_category text, p_gvm numeric)
returns jsonb language plpgsql stable set search_path = public as $$
declare st text := upper(coalesce(trim(p_state), '')); cat text := coalesce(p_category, '');
  age int := case when p_year is null then null else extract(year from (now() at time zone 'Australia/Brisbane'))::int - p_year end;
  bike boolean := cat = 'motorbikes'; towed boolean := cat in ('trailers', 'caravans'); heavy boolean := coalesce(p_gvm, 0) > 4500;
  nm text; law text; kind text; y int; k int;
begin
  if st = 'QLD' then
    return jsonb_build_object('free', true, 'why', 'Queensland: no statutory warranty on a sale on consignment for an owner who isn''t a motor dealer');
  end if;
  if st = 'VIC' then return jsonb_build_object('free', false, 'why', 'Victoria: it can''t be sold after the auction'); end if;
  nm := case st when 'NSW' then 'New South Wales' when 'WA' then 'Western Australia' when 'SA' then 'South Australia'
    when 'ACT' then 'The ACT' when 'TAS' then 'Tasmania' when 'NT' then 'The Northern Territory' end;
  if nm is null then return jsonb_build_object('free', null, 'why', 'Record the vehicle''s state first'); end if;
  law := case st when 'NSW' then 'the dealer guarantee' when 'TAS' then 'the statutory warranty' when 'NT' then 'the statutory warranty'
    else 'the dealer''s duty to repair' end;
  kind := case when bike then 'motorcycle' when towed then 'trailer or caravan' else 'vehicle' end;
  if cat = 'boats' then return jsonb_build_object('free', true, 'why', nm || ': ' || law || ' doesn''t cover boats'); end if;
  if heavy and st in ('NSW', 'ACT', 'TAS') then
    return jsonb_build_object('free', true, 'why', nm || ': ' || law || ' doesn''t cover a vehicle over 4.5 tonnes GVM');
  end if;
  if bike and st in ('SA', 'ACT') then
    return jsonb_build_object('free', true, 'why', nm || ': ' || law || ' doesn''t cover a second-hand motorcycle');
  end if;
  -- the limits: years, and kilometres (a trailer or caravan has no odometer to go by)
  y := case st when 'NSW' then case when bike then 5 else 10 end when 'WA' then case when bike then 8 else 12 end when 'SA' then 15
    when 'ACT' then 10 when 'TAS' then case when bike then 3 else 7 end when 'NT' then case when bike then 5 else 10 end end;
  k := case when towed then null else case st when 'NSW' then case when bike then 30000 else 160000 end
    when 'WA' then case when bike then 80000 else 180000 end when 'SA' then 200000 when 'ACT' then 160000
    when 'TAS' then case when bike then 15000 else 120000 end when 'NT' then case when bike then 30000 else 160000 end end end;
  if k is not null and p_odometer is not null and p_odometer > k then
    return jsonb_build_object('free', true, 'why', nm || ': ' || law || ' doesn''t cover a ' || kind || ' over ' || to_char(k, 'FM999,999') || ' km');
  end if;
  if age is null then
    return jsonb_build_object('free', null, 'why', nm || ': add its year and odometer to check that ' || law || ' doesn''t cover it');
  end if;
  if age >= y + 2 then
    return jsonb_build_object('free', true, 'why', nm || ': ' || law || ' doesn''t cover a ' || kind || ' more than ' || y || ' years old (this one is from ' || p_year || ')');
  end if;
  return jsonb_build_object('free', false, 'why', nm || ': ' || law || ' covers a ' || kind || ' sold by a dealer, even for its owner, up to ' || y || ' years old'
    || case when k is not null then ' and ' || to_char(k, 'FM999,999') || ' km' else '' end
    || ', and this one may be within it (' || p_year || case when p_odometer is not null then ', ' || to_char(p_odometer, 'FM999,999,999') || ' km' else '' end || ')');
end $$;
revoke execute on function public.warranty_free_for(text, int, numeric, text, numeric) from public, anon;
grant execute on function public.warranty_free_for(text, int, numeric, text, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Selling after the auction only where no statutory warranty applies (migration 26's check, with that step)
-- ---------------------------------------------------------------------------
create or replace function public.after_auction_check(p_lot bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l lots%rowtype; v_state text; v_rule jsonb; v_w jsonb; v_end timestamptz; v_rid bigint; v_rstatus text; v_code text; v_why text; v_req boolean;
begin
  select * into l from lots where id = p_lot;
  if not found then return jsonb_build_object('ok', false, 'code', 'lot_not_found', 'why', 'We couldn''t find that vehicle.'); end if;
  -- the vehicle's state is where it's consigned and collected; one located or registered in Victoria is Victorian
  v_state := case when upper(coalesce(l.rego_state, '')) = 'VIC' then 'VIC' else upper(coalesce(nullif(trim(l.state), ''), l.rego_state, '')) end;
  v_rule := after_auction_rule(v_state);
  v_w := warranty_free_for(v_state, l.year, l.odometer, l.category, l.gvm_kg);
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
  elsif v_w->>'free' is null then
    v_code := 'warranty_unknown'; v_why := (v_w->>'why') || '.';
  elsif not (v_w->>'free')::boolean then
    v_code := 'warranty'; v_why := (v_w->>'why') || '. We never give a statutory warranty, so it can''t be sold after the auction.';
  elsif v_rid is not null and v_rstatus <> 'draft' then
    v_code := 'relisted'; v_why := 'It''s already listed for the next auction (lot ' || v_rid || '), so it can only be sold there.';
  elsif coalesce(v_req, true) and (l.seller_id is null or v_end is null) then
    v_code := 'no_agreement'; v_why := 'There''s no signed seller agreement on it, so we have no authority to sell it.';
  elsif v_end is not null and v_end <= now() then
    v_code := 'authority'; v_why := 'The seller''s authority to sell ended on ' || to_char(v_end at time zone 'Australia/Brisbane', 'FMDD Mon YYYY')
      || ' (90 days after they signed). They sign the agreement again first.';
  end if;
  return jsonb_build_object('ok', v_code is null, 'code', v_code, 'why', v_why, 'state', v_state, 'rule', v_rule, 'warranty', v_w,
    'authority_ends', v_end, 'relist_id', v_rid, 'relist_status', v_rstatus);
end $$;
revoke execute on function public.after_auction_check(bigint) from public, anon, authenticated;
grant execute on function public.after_auction_check(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Every offer after the auction is made without a statutory warranty
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
  -- we never give a statutory warranty (after_auction_check has already refused a vehicle one would clearly cover):
  -- staff confirm none applies, from the vehicle's papers
  if p_warranty is null then raise exception 'warranty_needed:confirm that no statutory warranty applies to this sale'; end if;
  if p_warranty then
    raise exception 'warranty_applies:we never give a statutory warranty, so a vehicle that would carry one can''t be sold after the auction';
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
    values (p_lot, p_user, p_amount, v_exp, auth.uid(), 'after_auction', v->>'state', v_rule, false, null, v_docs, v_dec, v_name)
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

-- ---------------------------------------------------------------------------
-- 4. Never a listing with a statutory warranty; in the ACT, never a vehicle its duty to repair could cover
-- ---------------------------------------------------------------------------
create or replace function public.lot_publish_check() returns trigger
language plpgsql set search_path = public as $$
declare v_req boolean; v_missing text[]; v_w jsonb; s public.sales%rowtype; v_basis text; v_cert text; v_day date; v_auth_end timestamptz; v_sale_at timestamptz;
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
begin
  if new.status in ('live','scheduled') and (tg_op = 'INSERT' or old.status = 'draft') then
    if current_user in ('authenticated','service_role','anon') then
      -- we never give a statutory warranty: a listing that would carry one isn't published. In the ACT a dealer's duty to
      -- repair applies even at auction, so a vehicle it could cover can't be listed there.
      if new.statutory_warranty is true then
        raise exception 'not_ready:we never give a statutory warranty, so a vehicle that would carry one can''t be listed. Choose "Doesn''t apply" only if none does';
      end if;
      if upper(coalesce(new.state, '')) = 'ACT' or upper(coalesce(new.rego_state, '')) = 'ACT' then
        v_w := warranty_free_for('ACT', new.year, new.odometer, new.category, new.gvm_kg);
        if v_w->>'free' is null then
          raise exception 'not_ready:%', v_w->>'why';
        elsif not (v_w->>'free')::boolean then
          raise exception 'not_ready:%. In the ACT it applies even at auction, and we never give a statutory warranty, so it can''t be listed', v_w->>'why';
        end if;
      end if;
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
-- 5. The Terms of Sale (section 4, section 6) and the seller agreement (section 12) change: members accept the new
--    Terms before they bid again, and new agreements record the new version
-- ---------------------------------------------------------------------------
update public.settings set value = coalesce(value, '{}'::jsonb) || '{"buyer_version": "2026-10-27", "seller_version": "2026-10-27"}'::jsonb where key = 'terms';
