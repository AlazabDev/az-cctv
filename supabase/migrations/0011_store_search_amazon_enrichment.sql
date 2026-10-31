-- Amazon catalog enrichment: never create another commercial product table.
alter table public.products
 add column if not exists asin text,
 add column if not exists amazon_url text,
 add column if not exists availability text not null default 'unknown',
 add column if not exists rating numeric(3,2),
 add column if not exists review_count integer,
 add column if not exists amazon_raw jsonb not null default '{}'::jsonb,
 add column if not exists last_synced_at timestamptz,
 add column if not exists title_ar text,
 add column if not exists title_en text,
 add column if not exists description_ar text,
 add column if not exists description_en text,
 add column if not exists highlights text[] not null default '{}',
 add column if not exists tags text[] not null default '{}',
 add column if not exists images text[] not null default '{}',
 add column if not exists resolution text,
 add column if not exists lens text,
 add column if not exists ir_range integer,
 add column if not exists protection_rating text,
 add column if not exists poe_watts numeric(5,1),
 add column if not exists channels integer,
 add column if not exists ports integer,
 add column if not exists storage_tb numeric(5,1),
 add column if not exists sort_order integer not null default 0;
create unique index if not exists az_products_asin_unique on public.products(asin);
create index if not exists az_products_featured_idx on public.products(featured,sort_order) where is_active and published;

-- Add a stable URL-friendly identifier; never rewrite it on an update.
create or replace function public.az_store_set_slug()
returns trigger language plpgsql set search_path=public,pg_temp as $slug_fn$
begin
 if new.slug is null or btrim(new.slug)='' then
  new.slug:=trim(both '-' from regexp_replace(lower(coalesce(new.brand,'product')||'-'||coalesce(new.model,'item')),'[^a-z0-9]+','-','g'))||'-'||substr(new.id::text,1,8);
 end if;
 return new;
end;$slug_fn$;
drop trigger if exists az_products_slug_fill on public.products;
create trigger az_products_slug_fill before insert on public.products
for each row execute function public.az_store_set_slug();
update public.products set slug=trim(both '-' from regexp_replace(lower(coalesce(brand,'product')||'-'||coalesce(model,'item')),'[^a-z0-9]+','-','g'))||'-'||substr(id::text,1,8) where slug is null;

-- Weighted full-text index with untrusted catalogue text stored as data only.
alter table public.products
 add column if not exists fts tsvector generated always as (
   setweight(to_tsvector('simple'::regconfig,coalesce(product_name,'')),'A') ||
   setweight(to_tsvector('simple'::regconfig,coalesce(brand,'')||' '||coalesce(model,'')),'A') ||
   setweight(to_tsvector('simple'::regconfig,coalesce(title_ar,'')||' '||coalesce(name_ar,'')),'B') ||
   setweight(to_tsvector('simple'::regconfig,coalesce(description,'')),'C')
 ) stored;
create index if not exists az_products_fts_gin on public.products using gin(fts);
create index if not exists az_products_res_price on public.products(resolution,current_price) where is_active and published;

create or replace function public.search_store_products(
 p_query text default null,p_category text default null,p_brand text default null,
 p_resolution text default null,p_min_price numeric default null,p_max_price numeric default null,
 p_limit integer default 24,p_offset integer default 0
) returns setof public.products language sql stable security invoker set search_path=public,pg_temp as $search_fn$
 select p.* from public.products p
 where p.is_active and p.published
  and (nullif(btrim(p_category),'') is null or p.category=p_category)
  and (nullif(btrim(p_brand),'') is null or p.brand=p_brand)
  and (nullif(btrim(p_resolution),'') is null or p.resolution=p_resolution)
  and (p_min_price is null or p.current_price>=p_min_price)
  and (p_max_price is null or p.current_price<=p_max_price)
  and (nullif(btrim(p_query),'') is null or
       p.fts @@ websearch_to_tsquery('simple'::regconfig,p_query) or
       p.model ilike '%'||p_query||'%' or
       p.sku ilike '%'||p_query||'%')
 order by
   case when nullif(btrim(p_query),'') is null then 0 else ts_rank(p.fts,websearch_to_tsquery('simple'::regconfig,p_query)) end desc,
   p.featured desc,p.sort_order,p.brand,p.model,p.id
 limit greatest(1,least(coalesce(p_limit,24),100))
 offset greatest(0,least(coalesce(p_offset,0),100000));
$search_fn$;
revoke all on function public.search_store_products(text,text,text,text,numeric,numeric,integer,integer) from public;
grant execute on function public.search_store_products(text,text,text,text,numeric,numeric,integer,integer) to anon,authenticated;

-- Read-only aggregate facets from the same canonical product master.
create or replace function public.get_store_facets(p_category text default null)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $facets_fn$
 select jsonb_build_object(
  'count',count(*),
  'brands',coalesce((select jsonb_agg(brand order by brand) from (select distinct p2.brand from public.products p2 where p2.is_active and p2.published and p2.brand is not null and (nullif(btrim(p_category),'') is null or p2.category=p_category)) t), '[]'::jsonb),
  'categories',coalesce((select jsonb_agg(category order by category) from (select distinct p3.category from public.products p3 where p3.is_active and p3.published and p3.category is not null) t),'[]'::jsonb),
  'minimum_price',min(current_price),
  'maximum_price',max(current_price)
 ) from public.products p where p.is_active and p.published and (nullif(btrim(p_category),'') is null or p.category=p_category);
$facets_fn$;
revoke all on function public.get_store_facets(text) from public;
grant execute on function public.get_store_facets(text) to anon,authenticated;
