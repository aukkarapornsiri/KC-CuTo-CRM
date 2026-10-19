CREATE TABLE public.crm_sales_signature_defaults (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 storage_key text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT crm_sales_signature_owner_path CHECK (storage_key='' OR (split_part(storage_key,'/',1)=user_id::text AND split_part(storage_key,'/',2) LIKE 'seller-signature-%' AND array_length(string_to_array(storage_key,'/'),1)=2))
);
ALTER TABLE public.crm_sales_signature_defaults ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.crm_sales_signature_defaults TO authenticated;
REVOKE ALL ON public.crm_sales_signature_defaults FROM anon;
CREATE POLICY sales_signature_read ON public.crm_sales_signature_defaults FOR SELECT TO authenticated USING (user_id=(select auth.uid()) AND private.crm_can('quotations','view'));
CREATE POLICY sales_signature_insert ON public.crm_sales_signature_defaults FOR INSERT TO authenticated WITH CHECK (user_id=(select auth.uid()) AND (private.crm_can('quotations','create') OR private.crm_can('quotations','edit')));
CREATE POLICY sales_signature_update ON public.crm_sales_signature_defaults FOR UPDATE TO authenticated USING (user_id=(select auth.uid()) AND (private.crm_can('quotations','create') OR private.crm_can('quotations','edit'))) WITH CHECK (user_id=(select auth.uid()) AND (private.crm_can('quotations','create') OR private.crm_can('quotations','edit')));
CREATE POLICY sales_signature_asset_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='crm-quotation-assets' AND (storage.foldername(name))[1]=(select auth.uid())::text
 AND array_length(storage.foldername(name),1)=1 AND storage.filename(name) LIKE 'seller-signature-%'
 AND (private.crm_can('quotations','create') OR private.crm_can('quotations','edit'))
);
NOTIFY pgrst,'reload schema';
