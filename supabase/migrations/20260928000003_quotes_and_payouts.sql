-- Transport quote requests from lot pages
create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  lot_id bigint references public.lots(id) on delete set null,
  user_id uuid references public.profiles(id),
  postcode text not null,
  email text not null,
  status text not null default 'new' check (status in ('new','quoted','closed')),
  quote_note text,
  created_at timestamptz not null default now()
);
alter table public.quote_requests enable row level security;
create policy quotes_own on public.quote_requests for select using (user_id = auth.uid() or public.is_admin());
create policy quotes_admin on public.quote_requests for update using (public.is_admin()) with check (public.is_admin());

-- Seller payout tracking
alter table public.invoices add column seller_paid_at timestamptz;
alter table public.invoices add column seller_payout_note text;
