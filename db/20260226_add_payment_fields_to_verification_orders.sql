alter table if exists public.verification_orders
  add column if not exists payment_portal_used text,
  add column if not exists payment_detail_used text;

create index if not exists idx_verification_orders_payment_portal
  on public.verification_orders(payment_portal_used);
