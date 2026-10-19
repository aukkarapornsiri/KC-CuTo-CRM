-- The coordinator who assigns a lead is distinct from its sales owner.
ALTER TABLE public.leads ADD COLUMN lead_assigner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN lead_assigner_name text NOT NULL DEFAULT '';
CREATE FUNCTION private.crm_lead_assigner_eligible(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.crm_active_user(p_user) AND EXISTS(
  SELECT 1 FROM public.profiles p LEFT JOIN public.role_permissions r
  ON r.role_key=CASE WHEN p.role='custom' THEN p.custom_role_key ELSE p.role END AND r.module='leads'
  WHERE p.id=p_user AND (p.is_super_admin OR (r.can_view AND r.can_edit AND r.can_assign)))
$$;
REVOKE ALL ON FUNCTION private.crm_lead_assigner_eligible(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.crm_lead_assignment_contacts()
RETURNS TABLE(id uuid,display_name text,department_group text,is_active boolean,email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.crm_can('leads','view') OR NOT (private.crm_can('leads','create') OR private.crm_can('leads','edit')) THEN RAISE insufficient_privilege; END IF;
 RETURN QUERY SELECT p.id,p.display_name,p.department_group,p.is_active,u.email::text
 FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE private.crm_lead_assigner_eligible(p.id) ORDER BY p.display_name,p.id;
END $$;
CREATE FUNCTION private.crm_lead_assigner_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND new.lead_assigner_id IS NOT DISTINCT FROM old.lead_assigner_id THEN
  new.lead_assigner_name:=old.lead_assigner_name; RETURN new;
 END IF;
 IF auth.uid() IS NOT NULL AND NOT private.crm_can('leads',CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'edit' END) THEN RAISE insufficient_privilege; END IF;
 IF new.lead_assigner_id IS NOT NULL AND NOT private.crm_lead_assigner_eligible(new.lead_assigner_id) THEN
  RAISE EXCEPTION 'Lead assigner must be active and have View, Edit and Assign permissions';
 END IF;
 new.lead_assigner_name:=coalesce((SELECT display_name FROM public.profiles WHERE id=new.lead_assigner_id),'');
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION private.crm_lead_assigner_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crm_lead_assigner_guard BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION private.crm_lead_assigner_guard();
CREATE FUNCTION private.crm_lead_assigner_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF new.lead_assigner_id IS NULL THEN RETURN new; END IF;
 IF TG_OP='UPDATE' AND new.lead_assigner_id IS NOT DISTINCT FROM old.lead_assigner_id THEN RETURN new; END IF;
 INSERT INTO public.notifications(user_id,type,title,body,related_module,related_id)
 VALUES(new.lead_assigner_id,'lead','โปรด Assign Lead: '||coalesce(new.code,''),
 'กรุณาเลือกผู้รับลีด: '||coalesce(nullif(new.company_name,''),new.contact_name,''),'leads',new.id);
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION private.crm_lead_assigner_notice() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crm_lead_assigner_notice AFTER INSERT OR UPDATE OF lead_assigner_id ON public.leads FOR EACH ROW EXECUTE FUNCTION private.crm_lead_assigner_notice();
NOTIFY pgrst,'reload schema';
