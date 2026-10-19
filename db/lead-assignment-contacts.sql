CREATE OR REPLACE FUNCTION private.crm_lead_assignment_contacts() RETURNS TABLE(id uuid,display_name text,department_group text,is_active boolean,email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE insufficient_privilege; END IF;
 RETURN QUERY SELECT p.id,p.display_name,p.department_group,p.is_active,u.email::text FROM public.crm_assignment_people('leads') p JOIN auth.users u ON u.id=p.id ORDER BY p.display_name,p.id;
END $$;
REVOKE ALL ON FUNCTION private.crm_lead_assignment_contacts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.crm_lead_assignment_contacts() TO authenticated;
CREATE OR REPLACE FUNCTION public.crm_lead_assignment_contacts() RETURNS TABLE(id uuid,display_name text,department_group text,is_active boolean,email text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM private.crm_lead_assignment_contacts() $$;
REVOKE ALL ON FUNCTION public.crm_lead_assignment_contacts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_lead_assignment_contacts() TO authenticated;
NOTIFY pgrst,'reload schema';
