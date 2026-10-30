-- Defense in depth: Supabase default PUBLIC grants can expose INSERT privileges
-- even with RLS denying writes. Quotations may be written only by the
-- authenticated submit_store_quotation security-definer RPC.
revoke all privileges on table
  public.store_quotations,
  public.store_quotation_items,
  public.store_conversion_events
from public,anon,authenticated;
grant select on public.store_quotations,public.store_quotation_items to authenticated;
grant all on public.store_quotations,public.store_quotation_items,public.store_conversion_events to service_role;
revoke all on function public.submit_store_quotation(jsonb,jsonb,uuid) from public,anon;
grant execute on function public.submit_store_quotation(jsonb,jsonb,uuid) to authenticated;
