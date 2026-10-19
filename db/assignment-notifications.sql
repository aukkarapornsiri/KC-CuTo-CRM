CREATE OR REPLACE FUNCTION private.crm_assignment_eligible(p_user uuid,p_module text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.crm_active_user(p_user) AND EXISTS(SELECT 1 FROM public.profiles p LEFT JOIN public.role_permissions r ON r.role_key=CASE WHEN p.role='custom' THEN p.custom_role_key ELSE p.role END AND r.module=p_module WHERE p.id=p_user AND (p.is_super_admin OR coalesce(r.can_view,false)))
$$;
REVOKE ALL ON FUNCTION private.crm_assignment_eligible(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.crm_assignment_people(p_module text)
RETURNS TABLE(id uuid,display_name text,department_group text,is_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_module NOT IN ('leads','activities','tickets') OR NOT private.crm_can(p_module,'view') OR NOT (private.crm_can(p_module,'create') OR private.crm_can(p_module,'edit') OR private.crm_can(p_module,'assign')) THEN RAISE insufficient_privilege; END IF;
 RETURN QUERY SELECT p.id,p.display_name,p.department_group,p.is_active FROM public.profiles p
 WHERE private.crm_assignment_eligible(p.id,p_module) AND (p.id=auth.uid() OR private.crm_can(p_module,'assign')) ORDER BY p.display_name,p.id;
END $$;
REVOKE ALL ON FUNCTION public.crm_assignment_people(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_assignment_people(text) TO authenticated;
CREATE OR REPLACE FUNCTION private.crm_lead_assignees()
RETURNS TABLE(id uuid,display_name text,department_group text,is_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT (private.crm_can('leads','assign') AND private.crm_can('leads','edit')) THEN RAISE insufficient_privilege; END IF;
 RETURN QUERY SELECT * FROM public.crm_assignment_people('leads');
END $$;
CREATE OR REPLACE FUNCTION private.crm_work_assignment_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE key text; previous text; recipient text;
BEGIN
 FOREACH key IN ARRAY tg_argv LOOP
  previous:=CASE WHEN tg_op='UPDATE' THEN to_jsonb(old)->>key ELSE NULL END;
  recipient:=to_jsonb(new)->>key;
  IF recipient IS DISTINCT FROM previous THEN
   IF auth.uid() IS NOT NULL AND NOT (tg_op='INSERT' AND recipient=auth.uid()::text) AND NOT private.crm_can(tg_table_name,'assign') THEN RAISE insufficient_privilege USING message='Assignment permission required'; END IF;
   IF recipient IS NOT NULL AND NOT private.crm_assignment_eligible(recipient::uuid,tg_table_name) THEN RAISE EXCEPTION 'Assignee must be active and have permission to view this module'; END IF;
  END IF;
 END LOOP;
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION private.crm_work_assignment_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crm_work_assignment_guard BEFORE INSERT OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION private.crm_work_assignment_guard('owner_id');
CREATE TRIGGER crm_work_assignment_guard BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION private.crm_work_assignment_guard('owner_id');
CREATE TRIGGER crm_work_assignment_guard BEFORE INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION private.crm_work_assignment_guard('assigned_to_id','backup_engineer_id');
CREATE OR REPLACE FUNCTION private.crm_work_assignment_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE key text; recipient uuid; previous text; sent uuid[]:='{}'; rowdata jsonb:=to_jsonb(new); title text;
BEGIN
 title:=coalesce(nullif(rowdata->>'subject',''),nullif(rowdata->>'name',''),nullif(rowdata->>'company_name',''),nullif(rowdata->>'contact_name',''),rowdata->>'code','');
 FOREACH key IN ARRAY tg_argv LOOP
  recipient:=(rowdata->>key)::uuid; previous:=CASE WHEN tg_op='UPDATE' THEN to_jsonb(old)->>key ELSE NULL END;
  IF recipient IS NOT NULL AND recipient::text IS DISTINCT FROM previous AND NOT recipient=ANY(sent) AND private.crm_assignment_eligible(recipient,tg_table_name) THEN
   INSERT INTO public.notifications(user_id,type,title,body,related_module,related_id) VALUES(recipient,CASE WHEN tg_table_name='leads' THEN 'lead' ELSE 'activity' END,'ได้รับมอบหมาย: '||coalesce(rowdata->>'code',title),title,tg_table_name,new.id);
   sent:=array_append(sent,recipient);
  END IF;
 END LOOP;
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION private.crm_work_assignment_notice() FROM PUBLIC,anon,authenticated;
DROP TRIGGER crm_lead_assignment_notice ON public.leads;
DO $$ DECLARE module text; BEGIN
 FOREACH module IN ARRAY ARRAY['leads','activities','customers','contacts','opportunities','quotations','assets','documents'] LOOP
 EXECUTE format('CREATE TRIGGER crm_work_assignment_notice AFTER INSERT OR UPDATE OF owner_id ON public.%I FOR EACH ROW EXECUTE FUNCTION private.crm_work_assignment_notice(''owner_id'')',module);
 END LOOP;
END $$;
CREATE TRIGGER crm_work_assignment_notice AFTER INSERT OR UPDATE OF owner_id,renewal_owner_id ON public.contracts FOR EACH ROW EXECUTE FUNCTION private.crm_work_assignment_notice('owner_id','renewal_owner_id');
-- Ticket assignment notifications already exist in crm_service_audit; retain them without duplication.
ALTER TABLE public.crm_notification_email_queue ADD COLUMN related_id uuid;
CREATE OR REPLACE FUNCTION private.crm_queue_notification_email() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF new.user_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.crm_email_sender WHERE id AND provider='microsoft_graph' AND notifications_enabled AND verified_at IS NOT NULL AND new.created_at>=activated_at)
 AND private.crm_assignment_eligible(new.user_id,CASE WHEN lower(new.related_module) IN ('leads','customers','contacts','opportunities','quotations','contracts','assets','activities','tickets','documents','reports') THEN lower(new.related_module) ELSE 'activities' END)
 THEN INSERT INTO public.crm_notification_email_queue(notification_id,user_id,subject,body,related_module,related_id) VALUES(new.id,new.user_id,left(new.title,240),left(coalesce(new.body,''),4000),lower(new.related_module),new.related_id) ON CONFLICT(notification_id) DO NOTHING; END IF;
 RETURN new;
END $$;
CREATE OR REPLACE FUNCTION public.crm_notification_email_allowed(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.crm_notification_email_queue q WHERE q.id=p_id AND private.crm_assignment_eligible(q.user_id,CASE WHEN q.related_module IN ('leads','customers','contacts','opportunities','quotations','contracts','assets','activities','tickets','documents','reports') THEN q.related_module ELSE 'activities' END))
$$;
NOTIFY pgrst,'reload schema';
