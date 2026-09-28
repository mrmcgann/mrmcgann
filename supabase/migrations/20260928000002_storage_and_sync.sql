-- Keep has_reserve / reserve_met on the public lot in step with the private reserve.
create or replace function public.sync_reserve() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update lots set
    has_reserve = new.reserve_price is not null,
    reserve_met = (new.reserve_price is null or current_bid >= new.reserve_price)
  where id = new.lot_id;
  return new;
end $$;

create trigger sync_reserve after insert or update of reserve_price on public.lot_private
  for each row execute function public.sync_reserve();

-- Storage buckets
insert into storage.buckets (id, name, public) values ('lot-photos', 'lot-photos', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('appraisal-photos', 'appraisal-photos', false)
  on conflict (id) do nothing;

create policy "lot photos public read" on storage.objects for select using (bucket_id = 'lot-photos');
create policy "lot photos admin write" on storage.objects for insert with check (bucket_id = 'lot-photos' and public.is_admin());
create policy "lot photos admin update" on storage.objects for update using (bucket_id = 'lot-photos' and public.is_admin());
create policy "lot photos admin delete" on storage.objects for delete using (bucket_id = 'lot-photos' and public.is_admin());

-- Sellers can upload appraisal photos into a folder named after a random upload id.
create policy "appraisal photos upload" on storage.objects for insert with check (bucket_id = 'appraisal-photos');
create policy "appraisal photos admin read" on storage.objects for select using (bucket_id = 'appraisal-photos' and public.is_admin());

-- Homepage feature slot
alter table public.lots add column featured boolean not null default false;

-- Tracks which status change members have been told about (used by the cron job)
alter table public.lots add column notified_status text;

-- Server-only functions: only the service role (the app's back end) may call these directly.
revoke execute on function public.create_invoice(bigint, uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public.close_due_lots() from public, anon, authenticated;
grant execute on function public.create_invoice(bigint, uuid, numeric, text) to service_role;
grant execute on function public.close_due_lots() to service_role;
