-- The winning bidder's sale contract, and their acknowledgement of it.
--
-- The contract is made at the fall of the hammer (Sale of Goods Act 1923 (NSW) s 60(1), Sale of Goods Act 1896
-- (Qld) s 59 and the other states' equivalents), on the Terms the bidder accepted before bidding and the auction
-- conditions they ticked before entering the room. What this adds is the RECORD of that contract, and the buyer's
-- acknowledgement of having been given it.
--
-- The acknowledgement is never a condition of the sale. A buyer who never signs still bought the vehicle, still
-- owes the invoice, and is still banned and forfeits their deposit if they don't pay. Two states want the buyer's
-- signature on the auction notice itself (New South Wales Form 11, South Australia Forms 11 and 13), and there the
-- acknowledgement is how that form is discharged. See docs/legal-basis.md section 12.

alter table public.invoices
  add column if not exists buyer_ack_name text,
  add column if not exists buyer_ack_at timestamptz,
  add column if not exists buyer_ack_terms text;

comment on column public.invoices.buyer_ack_name is
  'The buyer''s own verified name, typed to acknowledge the sale contract. A receipt, never a condition of the sale.';

-- The seller's disclosures already answer the odometer question the Queensland statement needs
-- (MDCA Regulation 2014 (Qld) s 8). The engine question is not asked yet, so the statement says we were not told,
-- which is what "if known to the licensee" allows; adding it to the sell form is the next step.

-- ---------------------------------------------------------------------------
-- The buyer acknowledges their sale contract
-- ---------------------------------------------------------------------------
create or replace function public.acknowledge_sale(p_invoice uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); inv invoices%rowtype; p profiles%rowtype;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  select * into inv from invoices where id = p_invoice for update;
  if not found or inv.buyer_id <> v_user then raise exception 'invoice_not_found'; end if;
  if inv.sold_via = 'after_auction' then
    raise exception 'wrong_contract:a vehicle sold after the auction has its own signed contract';
  end if;
  if inv.buyer_ack_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'name', inv.buyer_ack_name, 'at', inv.buyer_ack_at);
  end if;
  select * into p from profiles where id = v_user;
  if char_length(v_name) < 3 then raise exception 'sign_name:type your full name to sign'; end if;
  -- the same test as the after-auction contract: the name has to be the one we verified
  if lower(v_name) <> lower(regexp_replace(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '\s+', ' ', 'g')) then
    raise exception 'sign_name:type your name as it is on your account: %', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''));
  end if;
  update invoices set buyer_ack_name = v_name, buyer_ack_at = now(), buyer_ack_terms = coalesce(inv.terms_version, p.terms_version)
   where id = p_invoice;
  return jsonb_build_object('ok', true, 'already', false, 'name', v_name, 'at', now());
end $$;
revoke execute on function public.acknowledge_sale(uuid, text) from public, anon;
grant execute on function public.acknowledge_sale(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- What the buyer's page needs to show about it
-- ---------------------------------------------------------------------------
-- Members read their own invoices under the existing row-level security, so this only answers for the signed-in
-- buyer. It never returns the seller's name: that reaches a buyer only on the Queensland statement itself, which
-- is built server-side in src/lib/pdf.ts.
create or replace function public.my_sale_contract(p_invoice uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); inv invoices%rowtype; v_state text;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  select * into inv from invoices where id = p_invoice and buyer_id = v_user;
  if not found then raise exception 'invoice_not_found'; end if;
  select state into v_state from lots where id = inv.lot_id;
  return jsonb_build_object(
    'invoice', inv.id, 'ref', inv.ref, 'lot', inv.lot_id, 'state', coalesce(v_state, ''),
    'after_auction', inv.sold_via = 'after_auction',
    'signed_name', inv.buyer_ack_name, 'signed_at', inv.buyer_ack_at, 'terms_version', inv.terms_version);
end $$;
revoke execute on function public.my_sale_contract(uuid) from public, anon;
grant execute on function public.my_sale_contract(uuid) to authenticated, service_role;
