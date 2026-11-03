
create function private.crm_so_amendment_serials(p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if auth.uid() is null or not private.crm_active_user() or not private.crm_can('quotations','view') or not private.crm_can('quotations','edit') then raise insufficient_privilege;end if;
 select f.product_lines into result from public.crm_so_amendments a join public.kc_dw_sales_order_facts f on f.id=a.sales_order_id where a.id=p_request_id and a.requested_by=auth.uid() and a.status='approved';
 if not found then raise insufficient_privilege using message='Approved amendment required';end if;return result;
end $$;
create function public.crm_so_amendment_serials(p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.crm_so_amendment_serials(p_request_id);$$;
revoke all on function private.crm_so_amendment_serials(uuid),public.crm_so_amendment_serials(uuid) from public,anon;
grant execute on function private.crm_so_amendment_serials(uuid),public.crm_so_amendment_serials(uuid) to authenticated;
create or replace function private.crm_document_referenced(p_key text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare t text;found boolean;begin
 if coalesce(p_key,'')='' then return true;end if;
 foreach t in array array['documents','quotations','crm_sales_orders','crm_quotation_templates','crm_sales_signature_defaults','crm_approval_events','crm_so_approvals','asset_attachments','crm_so_amendments'] loop
  execute format('select exists(select 1 from public.%I r where strpos(to_jsonb(r)::text,$1)>0)',t) into found using p_key;
  if found then return true;end if;
 end loop;return false;end $$;
create trigger crm_document_reference_guard before insert or update on public.crm_so_amendments for each row execute function private.crm_document_reference_guard();
notify pgrst,'reload schema';
