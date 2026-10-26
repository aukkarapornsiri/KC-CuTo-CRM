-- Signatures are immutable approval snapshots, never live Profile lookups.
ALTER TABLE public.crm_so_approvals ADD COLUMN IF NOT EXISTS signature_storage_key text;
ALTER TABLE public.crm_so_approvals ADD COLUMN IF NOT EXISTS reviewer_name text;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.crm_so_approvals FROM authenticated;

-- All active users may maintain their own Profile signature, including approvers.
ALTER POLICY sales_signature_read ON public.crm_sales_signature_defaults USING (user_id=(select auth.uid()) AND private.crm_active_user());
ALTER POLICY sales_signature_insert ON public.crm_sales_signature_defaults WITH CHECK (user_id=(select auth.uid()) AND private.crm_active_user());
ALTER POLICY sales_signature_update ON public.crm_sales_signature_defaults USING (user_id=(select auth.uid()) AND private.crm_active_user()) WITH CHECK (user_id=(select auth.uid()) AND private.crm_active_user());
ALTER POLICY sales_signature_asset_insert ON storage.objects WITH CHECK (
 bucket_id='crm-quotation-assets' AND (storage.foldername(name))[1]=(select auth.uid())::text
 AND array_length(storage.foldername(name),1)=1 AND storage.filename(name) LIKE 'seller-signature-%'
 AND private.crm_active_user()
);
CREATE POLICY profile_signature_read ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='crm-quotation-assets' AND (storage.foldername(name))[1]=(select auth.uid())::text
 AND storage.filename(name) LIKE 'seller-signature-%' AND private.crm_active_user()
);

CREATE OR REPLACE FUNCTION private.crm_so_capture_signature() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); k text;
BEGIN
 IF NEW.status='approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
  IF u IS NULL OR NOT private.crm_active_user() OR NOT private.crm_can('quotations','approve') OR NEW.reviewed_by IS DISTINCT FROM u THEN
   RAISE EXCEPTION 'SO approve permission required' USING errcode='42501';
  END IF;
  SELECT storage_key INTO k FROM public.crm_sales_signature_defaults WHERE user_id=u FOR SHARE;
  IF coalesce(k,'')='' OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='crm-quotation-assets' AND name=k) THEN
   RAISE EXCEPTION 'กรุณาบันทึกลายเซ็นใน Profile ก่อนอนุมัติ / Save your signature in Profile before approving';
  END IF;
  NEW.signature_storage_key:=k;
  SELECT coalesce(nullif(btrim(concat_ws(' ',first_name,last_name)),''),nullif(display_name,''),email) INTO NEW.reviewer_name FROM public.profiles WHERE id=u;
 ELSIF NEW.status<>'approved' THEN
  NEW.signature_storage_key:=NULL; NEW.reviewer_name:=NULL;
 ELSIF TG_OP='UPDATE' THEN
  NEW.signature_storage_key:=OLD.signature_storage_key; NEW.reviewer_name:=OLD.reviewer_name;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.crm_so_capture_signature() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crm_so_capture_signature BEFORE INSERT OR UPDATE ON public.crm_so_approvals FOR EACH ROW EXECUTE FUNCTION private.crm_so_capture_signature();
NOTIFY pgrst,'reload schema';
