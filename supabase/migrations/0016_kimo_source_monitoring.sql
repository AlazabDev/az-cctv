-- Canonical Kimo product mapping from unique, explicitly stored supplier URLs only.
-- Never infer SKU equivalence by names or edit prices during this migration.
create table if not exists public.product_source_monitor (
 id bigint generated always as identity primary key,
 product_id uuid not null references public.products(id) on delete cascade,
 source text not null default 'kimo' check(source='kimo'),
 handle text not null check(handle ~ '^[a-zA-Z0-9_-]+$'),
 source_url text not null,
 enabled boolean not null default true,
 last_checked_at timestamptz,
 last_changed_at timestamptz,
 last_error text,
 unique(product_id,source),
 unique(source,handle)
);
create index if not exists kimo_monitor_pending_idx on public.product_source_monitor(enabled,last_checked_at) where enabled;
alter table public.product_source_monitor enable row level security;
revoke all on public.product_source_monitor from public,anon,authenticated;
grant all on public.product_source_monitor to service_role;

alter table public.products add column if not exists in_stock boolean;
alter table public.products add column if not exists stock_checked_at timestamptz;
alter table public.products add column if not exists price_checked_at timestamptz;

create table if not exists public.product_source_sync_runs (
 id uuid primary key default gen_random_uuid(),
 requested_by uuid references auth.users(id) on delete set null,
 dry_run boolean not null default true,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 total integer not null default 0,
 checked integer not null default 0,
 changed integer not null default 0,
 failed integer not null default 0,
 status text not null default 'running' check(status in ('running','success','partial','failed')),
 details jsonb not null default '{}'::jsonb
);
alter table public.product_source_sync_runs enable row level security;
revoke all on public.product_source_sync_runs from public,anon,authenticated;
grant all on public.product_source_sync_runs to service_role;

create table if not exists public.product_source_price_stock_history (
 id bigint generated always as identity primary key,
 product_id uuid not null references public.products(id) on delete cascade,
 source text not null check(source='kimo'),
 old_price numeric(14,2),new_price numeric(14,2),
 old_in_stock boolean,new_in_stock boolean,
 changed_at timestamptz not null default now()
);
create index if not exists kimo_price_history_product on public.product_source_price_stock_history(product_id,changed_at desc);
alter table public.product_source_price_stock_history enable row level security;
revoke all on public.product_source_price_stock_history from public,anon,authenticated;
grant all on public.product_source_price_stock_history to service_role;

-- Exactly one product id per exact Kimo Shopify slug; no fuzzy matching.
with candidates as (
 select id as product_id,source_url,
 substring(source_url from '^https://kimostore[.]net/products/([a-zA-Z0-9_-]+)/?$') as handle
 from public.products where source_url ~ '^https://kimostore[.]net/products/'
), unique_candidates as(
 select product_id,source_url,handle from candidates
 where handle is not null and handle in (
 select handle from candidates group by handle having count(*)=1
 )
)
insert into public.product_source_monitor(product_id,source,handle,source_url)
select product_id,'kimo',handle,source_url from unique_candidates
on conflict(product_id,source) do nothing;
