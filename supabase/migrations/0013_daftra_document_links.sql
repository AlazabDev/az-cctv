-- AZ-CCTV -> Daftra accounting document link and supplier procurement execution state.
-- Preserve Daftra as accounting source of truth; do not clone invoice accounting.
alter table public.store_quotations add column if not exists approval_reference text;\ncreate table if not exists public.store_daftra_documents (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.store_quotations(id) on delete restrict,
  kind text not null check(kind in ('estimate','invoice','purchase_order')),
  supplier_source text not null default 'none' check (supplier_source in ('none','kimo','amazon')),
  daftra_id text,
  daftra_number text,
  status text not null default 'reserved' check(status in ('reserved','confirmed','reconcile_required','failed')),
  requested_by uuid not null references auth.users(id),
  request_key text not null unique,
  payload_hash text not null,
  last_error text,
  response_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quotation_id,kind,supplier_source)
);
create index if not exists store_daftra_documents_quote_idx on public.store_daftra_documents(quotation_id);
create unique index if not exists store_daftra_documents_external_unique on public.store_daftra_documents(kind,daftra_id) where daftra_id is not null;
alter table public.store_daftra_documents enable row level security;
revoke all on public.store_daftra_documents from public,anon,authenticated;
grant select on public.store_daftra_documents to authenticated;
drop policy if exists store_daftra_document_owner_select on public.store_daftra_documents;
create policy store_daftra_document_owner_select on public.store_daftra_documents
 for select to authenticated using (
   exists(select 1 from public.store_quotations q where q.id=quotation_id and q.user_id=(select auth.uid()))
 );
comment on table public.store_daftra_documents is 'Daftra document references, idempotency and reconciliation; never accounting ledger.';