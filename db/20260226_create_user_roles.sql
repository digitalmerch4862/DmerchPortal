create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now()
);

create index if not exists idx_user_roles_role on public.user_roles(role);

insert into public.user_roles (user_id, role)
select id, 'admin'
from auth.users
where lower(email) = 'rad4862@gmail.com'
on conflict (user_id) do update set role = excluded.role;
