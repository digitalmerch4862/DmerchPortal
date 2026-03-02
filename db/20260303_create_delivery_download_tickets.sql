create table if not exists public.delivery_download_tickets (
  ticket_id text primary key,
  email text not null,
  serial_no text not null,
  product_name text not null,
  source_url text not null,
  file_name text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_delivery_download_tickets_email
  on public.delivery_download_tickets(email);

create index if not exists idx_delivery_download_tickets_expires_at
  on public.delivery_download_tickets(expires_at);
