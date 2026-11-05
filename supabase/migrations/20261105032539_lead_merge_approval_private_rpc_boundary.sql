-- Keep the REST entry point unprivileged; the private implementation verifies the assigned reviewer.
alter function public.crm_lead_merge_decide(uuid,boolean) set schema private;
revoke all on function private.crm_lead_merge_decide(uuid,boolean) from public,anon;
grant execute on function private.crm_lead_merge_decide(uuid,boolean) to authenticated;
create function public.crm_lead_merge_decide(p_id uuid,p_approve boolean) returns void language sql security invoker set search_path='' as $$ select private.crm_lead_merge_decide(p_id,p_approve) $$;
revoke all on function public.crm_lead_merge_decide(uuid,boolean) from public,anon;
grant execute on function public.crm_lead_merge_decide(uuid,boolean) to authenticated;
