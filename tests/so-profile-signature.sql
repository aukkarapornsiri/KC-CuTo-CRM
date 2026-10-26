-- Rollback-only integration: no real approvals, uploads or notifications persist.
BEGIN;
SELECT set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' and is_active and deleted_at is null limit 1),true);
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES
 ('crm-sales-orders',auth.uid()::text||'/signature-test/po.pdf',auth.uid()::text,'{"mimetype":"application/pdf","size":100}'),
 ('crm-quotation-assets',auth.uid()::text||'/seller-signature-regression.png',auth.uid()::text,'{"mimetype":"image/png","size":100}');
SET LOCAL ROLE authenticated;
DO $$
DECLARE c uuid;q uuid;s public.crm_sales_orders;a public.crm_so_approvals;original text;k text:=auth.uid()::text||'/seller-signature-regression.png';
BEGIN
 SELECT storage_key INTO original FROM public.crm_sales_signature_defaults WHERE user_id=auth.uid();
 INSERT INTO public.crm_sales_signature_defaults(user_id,storage_key) VALUES(auth.uid(),'') ON CONFLICT(user_id) DO UPDATE SET storage_key='';
 INSERT INTO public.customers(name,status) VALUES('QA Signature Snapshot','Active') RETURNING id INTO c;
 INSERT INTO public.quotations(customer_id,owner_id,status,currency,items) VALUES(c,auth.uid(),'draft','THB','[{"name":"QA","qty":1,"price":100,"cost":50}]') RETURNING id INTO q;
 s:=public.crm_create_sales_order(q,'QA-SIGNATURE',current_date,auth.uid()::text||'/signature-test/po.pdf','po.pdf');
 BEGIN
  PERFORM public.crm_so_approval_action(s.id,'approve','');
  RAISE EXCEPTION 'Missing signature accepted';
 EXCEPTION WHEN OTHERS THEN IF sqlerrm NOT LIKE '%Save your signature in Profile%' THEN RAISE; END IF; END;
 IF (SELECT status FROM public.crm_so_approvals WHERE sales_order_id=s.id)<>'pending' THEN RAISE EXCEPTION 'Failed approval changed status'; END IF;
 UPDATE public.crm_sales_signature_defaults SET storage_key=k WHERE user_id=auth.uid();
 a:=public.crm_so_approval_action(s.id,'approve','');
 IF a.signature_storage_key IS DISTINCT FROM k OR a.reviewer_name IS NULL OR a.reviewed_by IS DISTINCT FROM auth.uid() OR a.reviewed_at IS NULL THEN RAISE EXCEPTION 'Missing approval snapshot'; END IF;
 UPDATE public.crm_sales_signature_defaults SET storage_key=coalesce(original,'') WHERE user_id=auth.uid();
 IF (SELECT signature_storage_key FROM public.crm_so_approvals WHERE sales_order_id=s.id) IS DISTINCT FROM k THEN RAISE EXCEPTION 'Signature changed retroactively'; END IF;
 BEGIN
  UPDATE public.crm_so_approvals SET signature_storage_key='forged' WHERE sales_order_id=s.id;
  RAISE EXCEPTION 'Direct snapshot write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.crm_sales_order_events WHERE sales_order_id=s.id AND action='so_approval_approve')<>1 THEN RAISE EXCEPTION 'Invalid event count'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
