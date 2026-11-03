-- The buyer draws their signature, as the seller already does on the agency agreement.
--
-- Strokes are kept as numbers, never as a picture the browser sends: the server checks them with cleanSignature()
-- and draws them back itself (src/lib/sellForm.ts, src/lib/pdf.ts). That is the same rule the sell form follows,
-- and it is why a signature can be re-drawn at any size and can't carry anything but line data.
--
-- The typed name stays, and stays the identity check: it has to match the name on the verified account. The drawn
-- signature is what the New South Wales and South Australian auction notices expect to see, and what people expect
-- of a contract. Neither makes the sale: that happened at the fall of the hammer.

alter table public.invoices add column if not exists buyer_ack_signature jsonb;

comment on column public.invoices.buyer_ack_signature is
  'The buyer''s drawn signature as checked stroke numbers ({w,h,strokes}), never an image. Optional: the typed verified name is the identity check.';

-- A light shape guard in the database as well as the full check in the route, so nothing odd can be stored even if
-- a future caller forgets to clean it.
alter table public.invoices drop constraint if exists invoices_ack_signature_shape;
alter table public.invoices add constraint invoices_ack_signature_shape check (
  buyer_ack_signature is null or (
    jsonb_typeof(buyer_ack_signature) = 'object'
    and jsonb_typeof(buyer_ack_signature->'strokes') = 'array'
    and jsonb_array_length(buyer_ack_signature->'strokes') between 1 and 80
    and (buyer_ack_signature->>'w')::numeric > 0 and (buyer_ack_signature->>'w')::numeric <= 2000
    and (buyer_ack_signature->>'h')::numeric > 0 and (buyer_ack_signature->>'h')::numeric <= 1000
    and pg_column_size(buyer_ack_signature) < 120000));

drop function if exists public.acknowledge_sale(uuid, text);

create or replace function public.acknowledge_sale(p_invoice uuid, p_name text, p_signature jsonb default null)
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
    return jsonb_build_object('ok', true, 'already', true, 'name', inv.buyer_ack_name, 'at', inv.buyer_ack_at,
      'drawn', inv.buyer_ack_signature is not null);
  end if;
  select * into p from profiles where id = v_user;
  if char_length(v_name) < 3 then raise exception 'sign_name:type your full name to sign'; end if;
  if lower(v_name) <> lower(regexp_replace(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '\s+', ' ', 'g')) then
    raise exception 'sign_name:type your name as it is on your account: %', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''));
  end if;
  update invoices set buyer_ack_name = v_name, buyer_ack_at = now(), buyer_ack_signature = p_signature,
    buyer_ack_terms = coalesce(inv.terms_version, p.terms_version)
   where id = p_invoice;
  return jsonb_build_object('ok', true, 'already', false, 'name', v_name, 'at', now(), 'drawn', p_signature is not null);
end $$;
revoke execute on function public.acknowledge_sale(uuid, text, jsonb) from public, anon;
grant execute on function public.acknowledge_sale(uuid, text, jsonb) to authenticated, service_role;

-- The buyer's own view of it gains whether they drew one. It still never carries the seller's name: that reaches a
-- buyer only on the statement itself, built server-side.
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
    'signed_name', inv.buyer_ack_name, 'signed_at', inv.buyer_ack_at, 'terms_version', inv.terms_version,
    'drawn', inv.buyer_ack_signature is not null);
end $$;
revoke execute on function public.my_sale_contract(uuid) from public, anon;
grant execute on function public.my_sale_contract(uuid) to authenticated, service_role;
