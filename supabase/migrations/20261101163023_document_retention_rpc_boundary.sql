-- Keep privileged implementations outside the exposed API schema.
alter function public.crm_document_inventory(timestamptz,timestamptz,text,integer,boolean) set schema private;
alter function public.crm_document_retention_save(text,integer,integer,boolean) set schema private;
alter function public.crm_document_delete_claim(uuid,uuid) set schema private;
alter function public.crm_document_delete_finish(uuid,text) set schema private;
alter function public.crm_document_retention_candidates() set schema private;
alter function public.crm_document_cron_authorized(text) set schema private;
grant usage on schema private to authenticated,service_role;
create function public.crm_document_inventory(p_from timestamptz default null,p_to timestamptz default null,p_bucket text default '',p_offset integer default 0,p_candidates boolean default false)
returns jsonb language sql security invoker set search_path='' as $$select private.crm_document_inventory(p_from,p_to,p_bucket,p_offset,p_candidates)$$;
create function public.crm_document_retention_save(p_bucket text,p_days integer,p_hour integer,p_enabled boolean)
returns void language sql security invoker set search_path='' as $$select private.crm_document_retention_save(p_bucket,p_days,p_hour,p_enabled)$$;
create function public.crm_document_delete_claim(p_object uuid,p_actor uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.crm_document_delete_claim(p_object,p_actor)$$;
create function public.crm_document_delete_finish(p_job uuid,p_error text)
returns void language sql security invoker set search_path='' as $$select private.crm_document_delete_finish(p_job,p_error)$$;
create function public.crm_document_retention_candidates()
returns jsonb language sql security invoker set search_path='' as $$select private.crm_document_retention_candidates()$$;
create function public.crm_document_cron_authorized(p_token text)
returns boolean language sql security invoker set search_path='' as $$select private.crm_document_cron_authorized(p_token)$$;
revoke all on function public.crm_document_inventory(timestamptz,timestamptz,text,integer,boolean),public.crm_document_retention_save(text,integer,integer,boolean),public.crm_document_delete_claim(uuid,uuid),public.crm_document_delete_finish(uuid,text),public.crm_document_retention_candidates(),public.crm_document_cron_authorized(text) from public,anon,authenticated;
grant execute on function public.crm_document_inventory(timestamptz,timestamptz,text,integer,boolean),public.crm_document_retention_save(text,integer,integer,boolean) to authenticated;
grant execute on function public.crm_document_delete_claim(uuid,uuid),public.crm_document_delete_finish(uuid,text),public.crm_document_retention_candidates(),public.crm_document_cron_authorized(text) to service_role;
