alter table public.verification_orders
  add column if not exists products_json jsonb,
  add column if not exists total_amount numeric(10, 2);

update public.verification_orders
set total_amount = amount
where total_amount is null;

update public.verification_orders
set products_json = jsonb_build_array(jsonb_build_object('name', product_name, 'amount', amount))
where products_json is null;
