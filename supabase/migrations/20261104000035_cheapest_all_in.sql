-- The all-in has to beat the market, with the tow inside it and never advertised separately.
--
-- Rory's rule. The forensic review priced the Commodore at $14,500 hammer: a buyer paid us $2,079 over the
-- hammer against Pickles' $889, Manheim's $911, Slattery's $954 and Grays' $1,015. We had built the most
-- transparent pricing in the market and pointed it at the worst number in it.
--
-- A flat percentage cannot win. Their structure is a thin marginal rate behind a flat fee -- Pickles is $650 plus
-- 1.65% -- so any rate above about 1.5% loses at the top however cheap it looks in the middle. Ours therefore
-- becomes a thin rate with a floor:
--
--   premium = greatest(price x premium_rate, premium_min) + transport,  GST on all of it,  no admin fee
--
-- At 1.5% with a $140 floor, modelled from $1,000 to $90,000 against all four schedules with the tow banked in,
-- we are cheapest at every price and the margin never closes: our marginal rate after GST is 1.65%, the same as
-- Pickles', so their flat $650 stays ahead of our floor for good.
--
-- premium_min defaults to 0, so every vehicle whose fees were already locked by lot_fees_snapshot keeps the exact
-- breakdown it was sold under. Only new listings price the new way.

update public.settings set value = value || jsonb_build_object(
  'premium_rate', 0.015,
  'premium_min', 140,
  -- The admin fee is gone rather than reduced. It was $99 of pure friction on a page whose whole argument is that
  -- the number beside the price is the number you pay.
  'admin_fee', 0,
  -- The cheapest competitor at each price, for the check below. Kept in settings because their fees move and
  -- this should be editable without a migration. Bands first (their flat fees and Grays' 7% band, which is the
  -- cheapest thing going between $10k and about $13k), then Pickles' $650 + 1.65% above that. Understating the
  -- market here is the safe direction; overstating it would let an expensive tow through.
  'benchmark', jsonb_build_object(
    'bands', jsonb_build_array(
      jsonb_build_object('to', 2000, 'fee', 495),
      jsonb_build_object('to', 5000, 'fee', 550),
      jsonb_build_object('to', 10000, 'fee', 710),
      jsonb_build_object('to', 13000, 'rate', 0.07)),
    'flat', 650, 'rate', 0.0165,
    -- Those bands are the CAR schedules. Trucks, machinery, trailers, caravans and boats go through everyone's
    -- industrial books instead, where Pickles runs 22.5% down to 9.9% and Slattery 16.5% down to 9.9%. Their
    -- thinnest industrial rate is the conservative benchmark for anything heavy, and we are nowhere near it --
    -- which is what makes a $650 tow on a truck affordable where it would be impossible on a $2,000 car.
    'heavy_rate', 0.099)
) where key = 'fees';

-- ---------------------------------------------------------------------------
-- The breakdown
-- ---------------------------------------------------------------------------

create or replace function public.price_breakdown_with(p_price numeric, f jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_transport numeric := greatest(round(coalesce((f->>'transport')::numeric, 0), 2), 0);
  -- The floor applies to our own cut, before the tow is added: a floor that swallowed the tow would quietly
  -- make cheap cars cost us money.
  v_premium numeric := greatest(round(p_price * coalesce((f->>'premium_rate')::numeric, 0), 2),
                                coalesce((f->>'premium_min')::numeric, 0)) + v_transport;
  v_gst numeric := round(v_premium * 0.10, 2);
  v_admin numeric := coalesce((f->>'admin_fee')::numeric, 0);
  v_sub numeric; v_mode text; v_card numeric; v_sur numeric;
begin
  v_sub := p_price + v_premium + v_gst + v_admin;
  if coalesce(f->>'pay_mode', 'transfer') = 'transfer' then
    v_mode := 'deposit'; v_card := 0; v_sur := 0;
  elsif f->>'pay_mode' = 'deposit' then
    v_mode := 'deposit'; v_card := least(deposit_for_with(p_price, f), v_sub); v_sur := 0;
  else
    if v_sub < coalesce((f->>'card_limit')::numeric, 0) then v_mode := 'card'; v_card := v_sub;
    else v_mode := 'deposit';
      v_card := case when v_sub < coalesce((f->>'nrd_split')::numeric, 0) then coalesce((f->>'nrd_low')::numeric, 0)
                     else coalesce((f->>'nrd_high')::numeric, 0) end;
    end if;
    v_sur := round(v_card * coalesce((f->>'surcharge_rate')::numeric, 0), 2);
  end if;
  return jsonb_build_object('price', p_price, 'premium', v_premium, 'transport', v_transport, 'gst', v_gst, 'admin_fee', v_admin,
    'subtotal', v_sub, 'mode', v_mode, 'card_base', v_card, 'surcharge', v_sur,
    'card_amount', v_card + v_sur, 'balance_due', v_sub - v_card, 'total', v_sub + v_sur);
end $$;

-- ---------------------------------------------------------------------------
-- The rule, enforced rather than calibrated once
-- ---------------------------------------------------------------------------

/* What the cheapest competitor would charge a buyer over the hammer at this price, GST inclusive. The first band
   whose ceiling this price is under wins; a band carries either a flat fee or a rate. Past the last band it is
   the headline flat plus rate. */
create or replace function public.market_fee(p_price numeric, f jsonb, p_category text default null) returns numeric
language sql immutable set search_path = public as $$
  select case when p_category in ('trucks','buses','machinery','trailers','caravans','boats')
    then round(p_price * coalesce((f->'benchmark'->>'heavy_rate')::numeric, 0), 2)
  else round(coalesce(
    (select case when b->>'fee' is not null then (b->>'fee')::numeric
                 else p_price * (b->>'rate')::numeric end
       from jsonb_array_elements(coalesce(f->'benchmark'->'bands', '[]'::jsonb)) b
      where p_price <= (b->>'to')::numeric
      order by (b->>'to')::numeric
      limit 1),
    coalesce((f->'benchmark'->>'flat')::numeric, 0) + p_price * coalesce((f->'benchmark'->>'rate')::numeric, 0)
  ), 2) end;
$$;

/* Does our all-in beat theirs at this price? True when the benchmark is unset, so a blank setting never blocks a
   listing: the check is a floor on our own discipline, not a kill switch. */
create or replace function public.beats_market(p_price numeric, f jsonb, p_category text default null) returns boolean
language sql immutable set search_path = public as $$
  select case when f->'benchmark' is null then true
    else ((price_breakdown_with(p_price, f)->>'total')::numeric - p_price) < market_fee(p_price, f, p_category) end;
$$;

revoke execute on function public.market_fee(numeric, jsonb, text) from public, anon;
revoke execute on function public.beats_market(numeric, jsonb, text) from public, anon;
grant execute on function public.market_fee(numeric, jsonb, text) to authenticated, service_role;
grant execute on function public.beats_market(numeric, jsonb, text) to authenticated, service_role;

/* The snapshot is where fees stop being a setting and become this vehicle's price, so it is where the rule is
   enforced. Tested at the estimate's low end, which is the floor of what it can sell for: our marginal rate
   after GST equals the benchmark's, so beating them at the bottom of the range beats them across it.
   Refused rather than warned, because "our all-in has to be less than theirs" is a rule, and the fix is in the
   hands of whoever is listing it -- lower the transport, or we absorb the difference. */
create or replace function public.lot_fees_snapshot() returns trigger language plpgsql set search_path = public as $$
declare v_at numeric;
begin
  if new.status = 'draft' then new.fees := null;
  elsif new.status in ('scheduled','live') and new.fees is null then
    select value || jsonb_build_object('transport', coalesce(new.transport_fee, 0)) into new.fees from settings where key = 'fees';
    v_at := coalesce(new.estimate_low, new.buy_now_price);
    if v_at is not null and not beats_market(v_at, new.fees, new.category) then
      raise exception 'over_market:the all-in would cost a buyer more than they would pay elsewhere at %, mostly because of the % transport. Lower the transport amount or price it lower.',
        v_at, coalesce(new.transport_fee, 0);
    end if;
  end if;
  return new;
end $$;
