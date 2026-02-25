create extension if not exists pgcrypto;

create sequence if not exists verification_order_seq start 1;

create or replace function public.next_verification_sequence()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_val integer;
begin
  select nextval('verification_order_seq')::integer into next_val;
  return next_val;
end;
$$;

create table if not exists public.verification_orders (
  id uuid primary key default gen_random_uuid(),
  sequence_no bigint not null unique,
  serial_no text not null unique,
  username text not null,
  email text not null,
  product_name text not null,
  amount numeric(10, 2) not null,
  reference_no text not null,
  admin_email text not null default 'digitalmerch4862@gmail.com',
  email_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists verification_orders_created_at_idx
  on public.verification_orders (created_at desc);

grant execute on function public.next_verification_sequence() to service_role;
