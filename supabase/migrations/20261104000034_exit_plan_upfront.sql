-- Decide how it leaves at the invoice, not at the gate.
--
-- Migration 33 put the registration check on the depot. That is the right place for the CHECK and the wrong place
-- for the DECISION. Our depots are tow yards: every question we add at their counter is a service they are
-- performing for us, which is their time and eventually our invoice. Worse, the gate is where a buyer who has
-- already paid discovers a problem, which is the most expensive possible moment to discover it.
--
-- So the buyer settles it when they pay, while they are sitting down with their phone and nothing is at stake:
-- a permit (with the state's link and the number typed in) or a truck. The depot then confirms what was already
-- decided rather than adjudicating it, which is a tick instead of a conversation.
--
-- transfer_submit already captured carrier/trailer/permit. What it never captured was the permit's number, so
-- the answer could not be checked against anything later. Now it can.

alter table public.ownership_transfers add column if not exists permit_ref text;

-- Replaced rather than overloaded: a five-argument call would silently skip the permit, which is the one field
-- this migration exists to collect.
drop function if exists public.transfer_submit(uuid, text, text, text, text[]);

create or replace function public.transfer_submit(
  p_invoice uuid, p_choice text, p_transport text, p_reference text, p_proof text[], p_permit text default null
) returns text language plpgsql security definer set search_path = public as $$
declare t public.ownership_transfers%rowtype; v_status text;
begin
  select * into t from ownership_transfers where invoice_id = p_invoice for update;
  if not found or t.buyer_id is distinct from auth.uid() then raise exception 'not_found'; end if;
  if t.status = 'complete' then raise exception 'already_done'; end if;
  if not exists (select 1 from invoices where id = p_invoice and status = 'paid') then raise exception 'not_paid'; end if;
  p_proof := coalesce(p_proof, '{}');
  if cardinality(p_proof) > 5 or exists (select 1 from unnest(p_proof) x
      where x !~ ('^' || p_invoice::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|pdf)$')) then
    raise exception 'bad_files';
  end if;
  if t.registration = 'unregistered' then p_choice := 'unregistered'; end if;
  if p_choice is null or p_choice not in ('transfer','unregistered') then raise exception 'choose'; end if;
  if p_choice = 'transfer' then
    if cardinality(p_proof) = 0 and coalesce(trim(p_reference), '') = '' then raise exception 'proof_needed'; end if;
    p_transport := 'drive';
  elsif coalesce(p_transport, '') not in ('carrier','trailer','permit') then
    raise exception 'transport_needed';
  end if;
  v_status := case when t.registration = 'unregistered' then 'complete' else 'submitted' end;
  update ownership_transfers set buyer_choice = p_choice, transport = p_transport,
    -- Their permit number if they have one yet. Blank is allowed on purpose: a buyer who says "I'll sort the
    -- permit before I come" is told the truth, which is that the depot will ask for it on the day.
    permit_ref = case when p_transport = 'permit' then left(nullif(trim(coalesce(p_permit, '')), ''), 40) else null end,
    reference = left(nullif(trim(coalesce(p_reference, '')), ''), 60), proof_paths = p_proof,
    submitted_at = now(), status = v_status, review_note = null,
    completed_at = case when v_status = 'complete' then now() else completed_at end
  where invoice_id = p_invoice;
  if v_status = 'complete' then perform collection_ready(p_invoice); end if;
  return v_status;
end $$;
revoke execute on function public.transfer_submit(uuid, text, text, text, text[], text) from public, anon;
grant execute on function public.transfer_submit(uuid, text, text, text, text[], text) to authenticated, service_role;

/* What the depot needs to know, which is now mostly "what did the buyer already say".
   `planned` is their own answer from the invoice and `permit_ref` the number they gave, so the gate confirms a
   decision instead of making one. permit_possible stays: no state issues a permit for a written-off vehicle. */
-- Dropped first: create-or-replace cannot widen a function's OUT columns.
drop function if exists public.leaves_unregistered(uuid);

create or replace function public.leaves_unregistered(p_invoice uuid)
returns table (unregistered boolean, permit_possible boolean, planned text, permit_ref text, on_wheels boolean)
language sql stable security definer set search_path = public as $$
  select
    (t.registration = 'unregistered' or t.buyer_choice = 'unregistered') as unregistered,
    coalesce(l.write_off_status, 'unknown') not in ('repairable', 'statutory') as permit_possible,
    t.transport as planned,
    t.permit_ref,
    -- Whether the thing itself travels the road on its own wheels. A boat never does: it sits on a trailer, and
    -- the trailer is what carries plates or needs the permit. Machinery goes on a float. Saying "driven" to the
    -- depot about either one is how you get a confident wrong answer at the gate.
    coalesce(l.category, '') not in ('boats', 'machinery') as on_wheels
  from ownership_transfers t
  join lots l on l.id = t.lot_id
  where t.invoice_id = p_invoice;
$$;
revoke execute on function public.leaves_unregistered(uuid) from public, anon;
grant execute on function public.leaves_unregistered(uuid) to authenticated, service_role;
