-- Stage 2 product catalog consolidation.
-- Invariant: public.products is the only commercial product table.
-- Project/design elements remain in design_items and may reference products.

-- A model name is not a unique product identity: the source contains legitimate
-- variants sharing brand/model (for example different resolution/channel variants).
alter table public.products drop constraint if exists ux_products_brand_model;
drop index if exists public.ux_products_brand_model;

alter table public.products
  add column if not exists source_sheet text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Preserve useful data from legacy child product tables before removing them.
do $$
begin
  if to_regclass('public.product_images') is not null then
    execute $sql$
      update public.products p
      set
        image_name = coalesce(p.image_name, i.file_name),
        image_url = coalesce(p.image_url, i.public_url)
      from lateral (
        select pi.file_name, pi.public_url
        from public.product_images pi
        where pi.product_id = p.id
        order by pi.is_primary desc, pi.sort_order asc, pi.created_at asc
        limit 1
      ) i
      where p.image_name is null or p.image_url is null
    $sql$;
  end if;

  if to_regclass('public.product_prices') is not null then
    execute $sql$
      update public.products p
      set
        current_price = coalesce(p.current_price, x.price),
        old_price = coalesce(p.old_price, x.old_price),
        currency = coalesce(nullif(p.currency, ''), x.currency),
        source_url = coalesce(p.source_url, x.source_url)
      from lateral (
        select pp.price, pp.old_price, pp.currency, pp.source_url
        from public.product_prices pp
        where pp.product_id = p.id
        order by pp.checked_at desc, pp.created_at desc
        limit 1
      ) x
      where p.current_price is null
         or p.old_price is null
         or p.source_url is null
    $sql$;
  end if;
end
$$;

drop table if exists public.product_images cascade;
drop table if exists public.product_prices cascade;

-- Import identity is provenance, not brand/model.
drop index if exists public.products_source_unique_idx;
create unique index products_source_unique_idx
  on public.products (source_sheet, source_row)
  where source_sheet is not null and source_row is not null;

create index if not exists products_active_type_idx
  on public.products (category, subcategory, brand)
  where is_active;

-- Keep read-only product catalog access for authenticated application users.
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

comment on table public.products is
  'Canonical commercial product master. Design-time experimental elements live in design_items and may reference products.';
