-- The "Sell your vehicle" form: the seller describes the vehicle, chooses reserve or no reserve, adds photos and signs
-- the Seller Agency Agreement (a drawn signature and their typed name) in one go. It's saved on the appraisal request
-- (server only, like before); staff turn it into a draft listing, and the seller then confirms with a verified ID on
-- their agreement page, where these answers are already filled in.

alter table public.appraisals
  add column if not exists details jsonb not null default '{}'::jsonb,       -- transmission, fuel, colour, condition, suburb, sell_when, owner_type
  add column if not exists disclosures jsonb not null default '{}'::jsonb,   -- the yes/no answers, as the agreement stores them
  add column if not exists reserve_type text,
  add column if not exists reserve_amount numeric(12,2),
  add column if not exists signed_name text,
  add column if not exists signed_at timestamptz,
  add column if not exists signature_path text,                             -- private bucket seller-docs
  add column if not exists agreement_path text,                             -- the signed copy (PDF), same bucket
  add column if not exists agreement_version text,
  add column if not exists signed_ip text,
  add column if not exists signed_ua text;

do $$ begin
  alter table public.appraisals add constraint appraisals_reserve_type check (reserve_type is null or reserve_type in ('none','reserve'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.appraisals add constraint appraisals_reserve_amount check (reserve_amount is null or (reserve_amount > 0 and reserve_amount <= 5000000));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.appraisals add constraint appraisals_reserve_pair check (reserve_type is distinct from 'reserve' or reserve_amount is not null);
exception when duplicate_object then null; end $$;

create index if not exists appraisals_lot on public.appraisals (lot_id) where lot_id is not null;
create index if not exists appraisals_created on public.appraisals (created_at desc);

-- The drawn signature on the agreement page too.
alter table public.seller_agreements add column if not exists signature_path text;

-- Requests (and now signed agreements) only arrive through the website's rate-limited form, which checks every answer
-- and records the signature itself: nobody can insert one straight through the database API any more.
drop policy if exists appraisals_insert on public.appraisals;

-- Sellers' photos: the form shrinks them in the browser first, so a photo over 12 MB, or anything that isn't a photo,
-- isn't something we should be keeping.
update storage.buckets set file_size_limit = 12582912, allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
where id = 'appraisal-photos';
