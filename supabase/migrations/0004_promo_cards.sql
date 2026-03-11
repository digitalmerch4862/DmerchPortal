create table if not exists public.promo_cards (
  slot smallint primary key check (slot between 1 and 3),
  title text not null default '',
  image_url text not null default '',
  href text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.promo_cards (slot, title, image_url, href)
values
  (1, 'Promo Slot 1', '', ''),
  (2, 'Promo Slot 2', '', ''),
  (3, 'Promo Slot 3', '', '')
on conflict (slot) do nothing;
