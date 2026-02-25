create table if not exists public.verification_monthly_counters (
  month_key text primary key,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.next_monthly_sequence(month_key text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value bigint;
begin
  insert into public.verification_monthly_counters (month_key, last_value, updated_at)
  values (month_key, 1, now())
  on conflict (month_key)
  do update
    set last_value = public.verification_monthly_counters.last_value + 1,
        updated_at = now()
  returning last_value into next_value;

  return next_value;
end;
$$;

grant execute on function public.next_monthly_sequence(text) to service_role;
