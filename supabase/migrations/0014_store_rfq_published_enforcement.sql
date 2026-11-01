-- Production RFQ: no unpublished catalogue product may be quoted, even with a crafted RPC call.
-- Retain atomic snapshot and server-only pricing of existing checkout procedure.
create or replace function public.submit_store_quotation(
  p_contact jsonb, p_items jsonb, p_project_id uuid default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $store_quote_fn$
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
  if (select count(*) from public.store_quotations where user_id=v_user and created_at > now()-interval '1 hour') >= 10 then
    raise exception 'Hourly quote limit exceeded' using errcode='22023';
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
  join public.products p on p.id=r.id and p.is_active and p.published and p.current_price is not null and p.current_price >= 0;
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
  join public.products p on p.id=r.id and p.is_active and p.published;
  update public.store_quotations set status='submitted',updated_at=now() where id=v_quote;
  return v_quote;
end;$store_quote_fn$;

revoke all on function public.submit_store_quotation(jsonb,jsonb,uuid) from public,anon;
grant execute on function public.submit_store_quotation(jsonb,jsonb,uuid) to authenticated;
