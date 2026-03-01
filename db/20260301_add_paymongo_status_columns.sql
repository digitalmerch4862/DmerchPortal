alter table if exists public.verification_orders
  add column if not exists payment_status text,
  add column if not exists paid_at timestamptz,
  add column if not exists paymongo_checkout_id text;

create index if not exists idx_verification_orders_payment_status
  on public.verification_orders(payment_status);

create index if not exists idx_verification_orders_paymongo_checkout_id
  on public.verification_orders(paymongo_checkout_id);
