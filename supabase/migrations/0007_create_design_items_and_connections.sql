-- Project design instances are NOT products.
-- They represent placed/proposed/experimental elements and may reference one canonical product.

create table if not exists public.design_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cctv_projects(id) on delete cascade,
  layout_id uuid references public.cctv_layouts(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  item_type text not null,
  design_status text not null default 'experimental',
  label text,
  x numeric,
  y numeric,
  rotation numeric,
  height_m numeric,
  custom_specs jsonb not null default '{}'::jsonb,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_items_status_check
    check (design_status in ('experimental','proposed','approved','installed','rejected'))
);

create index if not exists design_items_project_idx on public.design_items(project_id);
create index if not exists design_items_layout_idx on public.design_items(layout_id);
create index if not exists design_items_product_idx on public.design_items(product_id);
create index if not exists design_items_status_idx on public.design_items(design_status);

create table if not exists public.design_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.cctv_projects(id) on delete cascade,
  from_design_item_id uuid not null references public.design_items(id) on delete cascade,
  to_design_item_id uuid not null references public.design_items(id) on delete cascade,
  cable_type text,
  cable_run_id text,
  media_type text,
  length_m numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_connections_distinct_endpoints
    check (from_design_item_id <> to_design_item_id)
);

create index if not exists design_connections_project_idx on public.design_connections(project_id);
create index if not exists design_connections_from_idx on public.design_connections(from_design_item_id);
create index if not exists design_connections_to_idx on public.design_connections(to_design_item_id);

alter table public.design_items enable row level security;
alter table public.design_connections enable row level security;

revoke all on table public.design_items from anon;
revoke all on table public.design_connections from anon;
grant select, insert, update, delete on table public.design_items to authenticated;
grant select, insert, update, delete on table public.design_connections to authenticated;
grant all on table public.design_items to service_role;
grant all on table public.design_connections to service_role;

drop policy if exists "owners manage design items" on public.design_items;
create policy "owners manage design items"
on public.design_items
for all
to authenticated
using (
  exists (
    select 1 from public.cctv_projects p
    where p.id = design_items.project_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.cctv_projects p
    where p.id = design_items.project_id
      and p.user_id = auth.uid()
  )
  and (
    design_items.layout_id is null
    or exists (
      select 1 from public.cctv_layouts l
      where l.id = design_items.layout_id
        and l.project_id = design_items.project_id
    )
  )
);

drop policy if exists "owners manage design connections" on public.design_connections;
create policy "owners manage design connections"
on public.design_connections
for all
to authenticated
using (
  exists (
    select 1 from public.cctv_projects p
    where p.id = design_connections.project_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.cctv_projects p
    where p.id = design_connections.project_id
      and p.user_id = auth.uid()
  )
  and exists (
    select 1 from public.design_items a
    join public.design_items b on b.id = design_connections.to_design_item_id
    where a.id = design_connections.from_design_item_id
      and a.project_id = design_connections.project_id
      and b.project_id = design_connections.project_id
  )
);

create or replace function public.touch_design_row_updated_at()
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

drop trigger if exists design_items_touch on public.design_items;
create trigger design_items_touch
before update on public.design_items
for each row execute function public.touch_design_row_updated_at();

drop trigger if exists design_connections_touch on public.design_connections;
create trigger design_connections_touch
before update on public.design_connections
for each row execute function public.touch_design_row_updated_at();
