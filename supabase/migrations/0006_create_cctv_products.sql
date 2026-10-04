-- Product catalog for CCTV design application
-- Canonical import target for curated CCTV cameras, recorders, switches and UPS products.

create table if not exists public.cctv_products (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  subcategory text,
  brand text not null,
  model text not null,
  product_name text not null,
  description text,
  technology text,
  form_factor text,
  power_type text,
  current_price numeric(14,2),
  old_price numeric(14,2),
  discount_percent numeric(6,2),
  image_name text,
  image_url text,
  source_sheet text,
  source_row integer,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cctv_products_current_price_nonnegative check (current_price is null or current_price >= 0),
  constraint cctv_products_old_price_nonnegative check (old_price is null or old_price >= 0),
  constraint cctv_products_discount_range check (
    discount_percent is null or (discount_percent >= 0 and discount_percent <= 100)
  ),
  constraint cctv_products_source_unique unique (source_sheet, source_row)
);

create index if not exists cctv_products_category_idx
  on public.cctv_products (category);

create index if not exists cctv_products_subcategory_idx
  on public.cctv_products (subcategory);

create index if not exists cctv_products_brand_idx
  on public.cctv_products (brand);

create index if not exists cctv_products_model_idx
  on public.cctv_products (model);

create index if not exists cctv_products_active_category_idx
  on public.cctv_products (category, subcategory)
  where is_active;

alter table public.cctv_products enable row level security;

revoke all on table public.cctv_products from anon;
grant select on table public.cctv_products to authenticated;
grant all on table public.cctv_products to service_role;

drop policy if exists "authenticated can read cctv products" on public.cctv_products;
create policy "authenticated can read cctv products"
on public.cctv_products
for select
to authenticated
using (is_active = true);

create or replace function public.touch_cctv_products_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cctv_products_touch on public.cctv_products;
create trigger cctv_products_touch
before update on public.cctv_products
for each row
execute function public.touch_cctv_products_updated_at();
