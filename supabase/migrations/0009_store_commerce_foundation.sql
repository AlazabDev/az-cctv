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

-- Submit a quotation atomically. Never trust prices or totals sent by the browser.
create or replace function public.submit_store_quotation(
  p_contact jsonb, p_items jsonb, p_project_id uuid default null
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_quote uuid;
  v_count integer;
  v_valid integer;
  v_total numeric(14,2);
  v_currency text;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if jsonb_typeof(p_contact) <> 'object' or length(trim(coalesce(p_contact->>'name',''))) not between 2 and 150 then
    raise exception 'A valid customer name is required' using errcode='22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Select 1 to 50 products' using errcode='22023';
  end if;
  if p_project_id is not null and not exists(select 1 from public.cctv_projects p where p.id=p_project_id and p.user_id=v_user) then
    raise exception 'Project unavailable' using errcode='42501';
  end if;
  select count(*) into v_count from jsonb_array_elements(p_items) x;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where coalesce(x->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(x->>'quantity','') !~ '^[0-9]{1,3}$'
       or (x->>'quantity')::integer not between 1 and 100
  ) then raise exception 'Invalid item ID or quantity' using errcode='22023'; end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_items) x) <> v_count then
    raise exception 'Duplicate products are not allowed' using errcode='22023';
  end if;
  with requested as (
    select (x->>'id')::uuid id,(x->>'quantity')::integer quantity from jsonb_array_elements(p_items) x
  )
  select count(*),coalesce(sum(p.current_price*r.quantity),0),min(p.currency)
  into v_valid,v_total,v_currency
  from requested r
  join public.products p on p.id=r.id and p.is_active and p.current_price is not null and p.current_price >= 0;
  if v_valid <> v_count then raise exception 'Some products are unavailable for quotation' using errcode='22023'; end if;
  if (select count(distinct p.currency) from public.products p join (select (x->>'id')::uuid id from jsonb_array_elements(p_items) x) r on p.id=r.id) > 1 then
    raise exception 'Multiple currencies are not supported in one quote' using errcode='22023';
  end if;
  insert into public.store_quotations(user_id,project_id,customer_name,customer_email,customer_phone,company,notes,subtotal,total,currency,status)
  values(v_user,p_project_id,trim(p_contact->>'name'),left(nullif(trim(p_contact->>'email'),''),254),
    left(nullif(trim(p_contact->>'phone'),''),32),left(nullif(trim(p_contact->>'company'),''),200),
    left(nullif(trim(p_contact->>'notes'),''),2000),v_total,v_total,coalesce(v_currency,'EGP'),'draft')
  returning id into v_quote;
  insert into public.store_quotation_items(quotation_id,product_id,product_name,sku,quantity,unit_price,currency)
  select v_quote,p.id,coalesce(nullif(p.product_name,''),p.model),p.sku,r.quantity,p.current_price,p.currency
  from (select (x->>'id')::uuid id,(x->>'quantity')::integer quantity from jsonb_array_elements(p_items) x) r
  join public.products p on p.id=r.id;
  update public.store_quotations set status='submitted',updated_at=now() where id=v_quote;
  return v_quote;
end;$$;
revoke all on function public.submit_store_quotation(jsonb,jsonb,uuid) from public,anon;
grant execute on function public.submit_store_quotation(jsonb,jsonb,uuid) to authenticated;
