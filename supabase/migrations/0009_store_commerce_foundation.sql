-- AZ-CCTV commerce foundation. public.products remains the sole canonical product catalog.
-- No Amazon credentials are stored in public tables or exposed to web clients.
alter table public.products add column if not exists slug text;
alter table public.products add column if not exists published boolean not null default true;
alter table public.products add column if not exists featured boolean not null default false;
alter table public.products add column if not exists seo_title text;
alter table public.products add column if not exists seo_description text;
create unique index if not exists az_products_slug_unique on public.products(slug) where slug is not null;
create index if not exists az_products_public_category on public.products(category,subcategory,brand) where is_active and published;
create extension if not exists pg_trgm with schema extensions;
create index if not exists az_products_search_trgm on public.products using gin (model extensions.gin_trgm_ops);
-- Requires pg_trgm on projects without the extension:

create table if not exists public.store_quotations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid references public.cctv_projects(id) on delete set null,
 status text not null default 'draft' check(status in('draft','submitted','reviewing','quoted','accepted','rejected','expired')),
 customer_name text not null,
 customer_email text,
 customer_phone text,
 company text,
 notes text,
 currency text not null default 'EGP',
 subtotal numeric(14,2) not null default 0 check(subtotal>=0),
 total numeric(14,2) not null default 0 check(total>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.store_quotation_items (
 id uuid primary key default gen_random_uuid(),
 quotation_id uuid not null references public.store_quotations(id) on delete cascade,
 product_id uuid references public.products(id) on delete set null,
 product_name text not null,
 sku text,
 quantity integer not null check(quantity between 1 and 10000),
 unit_price numeric(14,2) check(unit_price>=0),
 currency text not null default 'EGP'
);
create table if not exists public.store_conversion_events (
 id bigint generated always as identity primary key,
 session_id uuid not null,
 user_id uuid references auth.users(id) on delete set null,
 event_type text not null check(event_type in ('store_visit','search','product_view','compare','add_to_cart','quote_request','signup','use_in_design','create_project','complete_design')),
 product_id uuid references public.products(id) on delete set null,
 project_id uuid references public.cctv_projects(id) on delete set null,
 utm_source text,utm_medium text,utm_campaign text,referrer text,
 created_at timestamptz not null default now()
);
create index if not exists az_store_events_created on public.store_conversion_events(created_at,event_type);
create index if not exists az_store_events_source on public.store_conversion_events(utm_source,created_at);
create index if not exists az_store_quotations_owner on public.store_quotations(user_id,created_at desc);
create index if not exists az_store_quote_items_parent on public.store_quotation_items(quotation_id);

alter table public.store_quotations enable row level security;
alter table public.store_quotation_items enable row level security;
alter table public.store_conversion_events enable row level security;

create policy "store_quotes_read_own" on public.store_quotations for select to authenticated using(user_id=(select auth.uid()));
create policy "store_quotes_insert_own" on public.store_quotations for insert to authenticated with check(user_id=(select auth.uid()) and status='draft');
create policy "store_quotes_update_draft_own" on public.store_quotations for update to authenticated using(user_id=(select auth.uid()) and status='draft') with check(user_id=(select auth.uid()) and status in ('draft','submitted'));
create policy "store_quote_items_read_own" on public.store_quotation_items for select to authenticated using(exists(select 1 from public.store_quotations q where q.id=quotation_id and q.user_id=(select auth.uid())));
create policy "store_quote_items_insert_draft_own" on public.store_quotation_items for insert to authenticated with check(exists(select 1 from public.store_quotations q where q.id=quotation_id and q.user_id=(select auth.uid()) and q.status='draft'));
create policy "store_quote_items_update_draft_own" on public.store_quotation_items for update to authenticated using(exists(select 1 from public.store_quotations q where q.id=quotation_id and q.user_id=(select auth.uid()) and q.status='draft')) with check(exists(select 1 from public.store_quotations q where q.id=quotation_id and q.user_id=(select auth.uid()) and q.status='draft'));
create policy "store_quote_items_delete_draft_own" on public.store_quotation_items for delete to authenticated using(exists(select 1 from public.store_quotations q where q.id=quotation_id and q.user_id=(select auth.uid()) and q.status='draft'));
-- Conversion ingestion deliberately stays server-side. Never grant INSERT to anon.
grant select,insert,update on public.store_quotations to authenticated;
grant select,insert,update,delete on public.store_quotation_items to authenticated;
revoke all on public.store_conversion_events from anon,authenticated;
grant all on public.store_conversion_events to service_role;
-- Product specifications are shared but product identity remains unchanged.
comment on table public.store_conversion_events is 'Server-ingested, privacy-limited conversion events. No raw IP or fingerprint stored.';
