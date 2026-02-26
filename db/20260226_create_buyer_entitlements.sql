create table if not exists public.buyer_entitlements (
  email text primary key,
  approved_product_count integer not null default 0,
  download_used integer not null default 0,
  download_limit integer not null default 10,
  is_unlimited boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists idx_buyer_entitlements_unlimited
  on public.buyer_entitlements(is_unlimited);
