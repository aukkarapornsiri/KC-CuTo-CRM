ALTER TABLE public.leads ADD COLUMN lead_type text NOT NULL DEFAULT 'Company' CHECK (lead_type IN ('Company','Individual')), ADD COLUMN tax_id text;
ALTER TABLE public.leads ADD CONSTRAINT leads_tax_id_format CHECK (tax_id IS NULL OR tax_id='' OR tax_id ~ '^[0-9]{13}$');
DO $migration$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.crm_convert_lead(uuid)'::regprocedure);
 IF position('VALUES(src.company_name,src.phone' in definition)=0 THEN RAISE EXCEPTION 'Unexpected conversion function'; END IF;
 definition:=replace(definition,'IF length(trim(src.company_name))=0 THEN', 'IF src.lead_type=''Individual'' THEN src.company_name:=nullif(trim(src.contact_name),''''); END IF; IF coalesce(length(trim(src.company_name)),0)=0 THEN');
 definition:=replace(definition,'INSERT INTO public.customers(name,phone','INSERT INTO public.customers(name,type,tax_id,phone');
 definition:=replace(definition,'VALUES(src.company_name,src.phone','VALUES(src.company_name,src.lead_type,src.tax_id,src.phone');
 EXECUTE definition;
END $migration$;
NOTIFY pgrst,'reload schema';
