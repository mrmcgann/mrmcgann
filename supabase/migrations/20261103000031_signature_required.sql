-- The drawn signature is required, in every state.
--
-- It was optional: a buyer could acknowledge with the typed name alone. Rory's call is that they sign it properly
-- wherever the vehicle is, so the signature is now checked after the name and refused if it isn't there.
--
-- What this does NOT change: the sale. The contract was made at the fall of the hammer, and a buyer who never opens
-- their invoice still owns the vehicle and still owes for it. Refusing to record an acknowledgement without a
-- signature is a rule about our own paperwork, not a condition of the sale, and nothing in the wording says
-- otherwise. In New South Wales and South Australia the signature also discharges that state's own auction notice.
--
-- The strokes are still only ever numbers (migration 30): cleanSignature() in the route, the shape constraint on
-- the column, and the server draws it back itself.

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
  -- checked after the name so the name's own message still comes first, which is the one people hit most
  if p_signature is null or jsonb_array_length(coalesce(p_signature->'strokes', '[]'::jsonb)) = 0 then
    raise exception 'sign_draw:draw your signature in the box before you sign';
  end if;
  update invoices set buyer_ack_name = v_name, buyer_ack_at = now(), buyer_ack_signature = p_signature,
    buyer_ack_terms = coalesce(inv.terms_version, p.terms_version)
   where id = p_invoice;
  return jsonb_build_object('ok', true, 'already', false, 'name', v_name, 'at', now(), 'drawn', true);
end $$;
revoke execute on function public.acknowledge_sale(uuid, text, jsonb) from public, anon;
grant execute on function public.acknowledge_sale(uuid, text, jsonb) to authenticated, service_role;
