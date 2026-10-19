BEGIN;
DO $$
DECLARE creator uuid; coordinator uuid; lead_id uuid:=gen_random_uuid(); found_owner uuid; found_assigner uuid; n integer;
BEGIN
 SELECT p.id INTO creator FROM public.profiles p JOIN public.role_permissions r ON r.role_key=CASE WHEN p.role='custom' THEN p.custom_role_key ELSE p.role END AND r.module='leads' WHERE private.crm_active_user(p.id) AND NOT p.is_super_admin AND r.can_view AND r.can_create AND NOT r.can_assign LIMIT 1;
 SELECT p.id INTO coordinator FROM public.profiles p WHERE private.crm_lead_assigner_eligible(p.id) AND p.id<>creator LIMIT 1;
 IF creator IS NULL OR coordinator IS NULL THEN RAISE EXCEPTION 'Test needs creator without Assign and eligible coordinator'; END IF;
 PERFORM set_config('request.jwt.claim.sub',creator::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF NOT EXISTS(SELECT 1 FROM public.crm_lead_assignment_contacts() WHERE id=coordinator) THEN RAISE EXCEPTION 'Creator cannot select coordinator'; END IF;
 IF EXISTS(SELECT 1 FROM public.crm_lead_assignment_contacts() WHERE id=creator) THEN RAISE EXCEPTION 'Non-assigner leaked into directory'; END IF;
 INSERT INTO public.leads(id,code,company_name,contact_name,last_name,owner_id,lead_assigner_id) VALUES(lead_id,'TEST-ROLLBACK','Assigner check','Test','Test',creator,coordinator);
 SELECT owner_id,lead_assigner_id INTO found_owner,found_assigner FROM public.leads WHERE id=lead_id;
 IF found_owner<>creator OR found_assigner<>coordinator THEN RAISE EXCEPTION 'Owner and coordinator conflated'; END IF;
 BEGIN
 INSERT INTO public.leads(code,company_name,last_name,owner_id,lead_assigner_id) VALUES('TEST-REJECT','Reject','Test',creator,creator);
 RAISE EXCEPTION 'Invalid coordinator accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Lead assigner must%' THEN RAISE; END IF; END;
 EXECUTE 'RESET ROLE';
 SELECT count(*) INTO n FROM public.notifications WHERE related_id=lead_id AND user_id=coordinator AND title LIKE 'โปรด Assign Lead:%';
 IF n<>1 THEN RAISE EXCEPTION 'Expected exactly one coordinator notification, got %',n; END IF;
 SELECT count(*) INTO n FROM public.crm_notification_email_queue WHERE related_id=lead_id AND user_id=coordinator;
 IF n<>1 THEN RAISE EXCEPTION 'Expected one queued deep-link email, got %',n; END IF;
 PERFORM set_config('request.jwt.claim.sub',coordinator::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 UPDATE public.leads SET owner_id=coordinator WHERE id=lead_id;
 EXECUTE 'RESET ROLE';
 SELECT count(*) INTO n FROM public.notifications WHERE related_id=lead_id AND user_id=coordinator AND title LIKE 'โปรด Assign Lead:%';
 IF n<>1 THEN RAISE EXCEPTION 'Owner change duplicated coordinator request'; END IF;
 IF (SELECT lead_assigner_id FROM public.leads WHERE id=lead_id)<>coordinator THEN RAISE EXCEPTION 'Assigning changed coordinator'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN PERFORM * FROM public.crm_lead_assignment_contacts(); RAISE EXCEPTION 'Anonymous directory allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
