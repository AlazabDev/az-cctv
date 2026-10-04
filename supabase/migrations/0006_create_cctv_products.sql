-- Canonical product master for CCTV design application.
-- One and only one commercial product table: public.products.
-- Design-time/experimental elements are stored separately and may optionally reference products.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid()
);

alter table public.products
  add column if not exists category text,
  add column if not exists subcategory text,
  add column if not exists brand text,
  add column if not exists model text,
  add column if not exists product_name text,
  add column if not exists description text,
  add column if not exists technology text,
  add column if not exists form_factor text,
  add column if not exists power_type text,
  add column if not exists current_price numeric(14,2),
  add column if not exists old_price numeric(14,2),
  add column if not exists discount_percent numeric(6,2),
  add column if not exists image_name text,
  add column if not exists image_url text,
  add column if not exists source_sheet text,
  add column if not exists source_row integer,
  add column if not exists specifications jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists products_source_unique_idx
  on public.products (source_sheet, source_row)
  where source_sheet is not null and source_row is not null;

create index if not exists products_category_idx on public.products (category);
create index if not exists products_subcategory_idx on public.products (subcategory);
create index if not exists products_brand_idx on public.products (brand);
create index if not exists products_model_idx on public.products (model);
create index if not exists products_active_category_idx
  on public.products (category, subcategory)
  where is_active;

alter table public.products enable row level security;

revoke all on table public.products from anon;
grant select on table public.products to authenticated;
grant all on table public.products to service_role;

drop policy if exists "authenticated can read products" on public.products;
create policy "authenticated can read products"
on public.products
for select
to authenticated
using (is_active = true);

create or replace function public.touch_products_updated_at()
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

drop trigger if exists products_touch on public.products;
create trigger products_touch
before update on public.products
for each row
execute function public.touch_products_updated_at();
