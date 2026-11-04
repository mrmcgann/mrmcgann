-- Handing over an unregistered vehicle without permitting an offence.
--
-- Transport Operations (Road Use Management--Vehicle Registration) Regulation 2021 (Qld) s 10(1): "A person must
-- not use, OR PERMIT TO BE USED, a vehicle on a road that is not a registered vehicle." Maximum 80 penalty units.
-- Every state has an offence of the same shape. The limb that reaches us is "permit to be used": we are the party
-- holding the vehicle, holding the keys, and deciding whether it leaves.
--
-- Section 10(2)(f) is the way out: subsection (1) does not apply to a vehicle "being used under an unregistered
-- vehicle permit" (s 73, up to 7 days). So a vehicle leaving our depot unregistered is lawful in exactly three
-- shapes -- on a carrier, on a trailer, or driven under a current permit -- and our protection is requiring the
-- depot to establish which one before the keys change hands, and recording it.
--
-- Until now the handover screen asked for the odometer, the keys and a note. It did not know the vehicle was
-- unregistered, did not ask how it was leaving, and the permit upload on the buyer's side was marked optional.
-- A buyer could tick "I'll use a permit", never get one, and drive off our forecourt while our own staff handed
-- them the keys. That is the fact pattern s 10(1) describes.

-- ---------------------------------------------------------------------------
-- What the depot must establish
-- ---------------------------------------------------------------------------

/* Is this vehicle leaving unregistered? Either it was sold without plates, or it was registered and the buyer
   chose to take it unregistered (in which case the registration is cancelled and the plates go back). */
create or replace function public.leaves_unregistered(p_invoice uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ownership_transfers t
    where t.invoice_id = p_invoice
      and (t.registration = 'unregistered' or t.buyer_choice = 'unregistered')
  );
$$;
revoke execute on function public.leaves_unregistered(uuid) from public, anon;
grant execute on function public.leaves_unregistered(uuid) to authenticated, service_role;

-- The old five-argument form is replaced, not overloaded: one handover rule, and no way to call the version that
-- skipped the check. Only /api/handover calls it, through the service role.
drop function if exists public.complete_handover(text, text, int, int, text);

create or replace function public.complete_handover(
  p_token text, p_code text, p_odometer int, p_keys int, p_notes text,
  p_left_by text default null, p_permit text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.collections%rowtype; v_claim timestamptz; v_title text; v_unreg boolean; v_permit text;
begin
  select * into c from collections where seller_token = p_token for update;
  if not found then raise exception 'not_found'; end if;
  if c.status = 'collected' then return jsonb_build_object('ok', true, 'already', true); end if;
  if c.status <> 'confirmed' then raise exception 'not_confirmed'; end if;
  if c.code_attempts >= 5 then raise exception 'too_many_attempts'; end if;
  if p_code is distinct from c.release_code then
    update collections set code_attempts = code_attempts + 1 where id = c.id;
    return jsonb_build_object('ok', false, 'error', case when c.code_attempts + 1 >= 5 then 'too_many_attempts' else 'wrong_code' end);
  end if;

  -- The registration check, after the code so a wrong code still fails first and the depot isn't asked to
  -- establish anything about a collector who hasn't proved who they are.
  v_unreg := leaves_unregistered(c.invoice_id);
  if v_unreg then
    if coalesce(p_left_by, '') not in ('carrier', 'trailer', 'permit') then
      raise exception 'unreg_how';
    end if;
    if p_left_by = 'permit' then
      v_permit := nullif(trim(coalesce(p_permit, '')), '');
      -- A permit number we have actually been shown. Without it, driving away is the s 10(1) offence and we are
      -- the ones permitting it, so the handover cannot complete and the keys stay with us.
      if v_permit is null or length(v_permit) < 4 then raise exception 'unreg_permit'; end if;
    end if;
  end if;

  v_claim := business_days_from(now(), setting_num('auction','claim_days')::int);
  update invoices set collected_at = now(), claim_until = v_claim where id = c.invoice_id;
  update collections set status = 'collected', collected_at = now(),
    handover = jsonb_build_object(
      'odometer', p_odometer, 'keys', p_keys, 'notes', left(coalesce(p_notes, ''), 1000), 'at', now(),
      -- The evidence: what the depot established before letting it go.
      'unregistered', v_unreg, 'left_by', case when v_unreg then p_left_by else 'driven' end,
      'permit', v_permit)
  where id = c.id;

  select title into v_title from lots where id = c.lot_id;
  perform queue_notice(c.buyer_id, 'account', 'Collected: ' || v_title,
    'Handed over at our depot. The vehicle is now your responsibility. If something is materially different from the listing, lodge a claim from your invoice by ' ||
    to_char(v_claim at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth') || '.', '/account/invoices/' || c.invoice_id, 'collected:' || c.id);
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.complete_handover(text, text, int, int, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_handover(text, text, int, int, text, text, text) to service_role;
