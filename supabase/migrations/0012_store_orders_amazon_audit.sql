-- Orders are distinct from products; no catalogue mirror is introduced.
create table if not exists public.store_orders (
 id uuid primary key default gen_random_uuid(),
 quotation_id uuid not null unique references public.store_quotations(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,
 status text not null default 'pending' check(status in('pending','processing','submitted','confirmed','shipped','delivered','completed','failed','cancelled')),
 amazon_order_id text,
 fulfillment_order_id text unique,
 shipping_address jsonb,
 amount numeric(14,2) check(amount>=0),
 currency text not null default 'EGP',
 amazon_response jsonb,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists az_store_orders_user on public.store_orders(user_id,created_at desc);
alter table public.store_orders enable row level security;
create policy "store_order_read_own" on public.store_orders for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.store_orders from public,anon,authenticated;
grant select on public.store_orders to authenticated;
grant all on public.store_orders to service_role;

create table if not exists public.store_amazon_api_logs (
 id bigint generated always as identity primary key,
 endpoint text not null,
 method text not null,
 status_code integer,
 execution_time_ms integer,
 request_summary jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.store_amazon_api_logs enable row level security;
revoke all on public.store_amazon_api_logs from public,anon,authenticated;
grant all on public.store_amazon_api_logs to service_role;
