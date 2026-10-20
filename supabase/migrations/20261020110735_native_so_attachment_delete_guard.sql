alter policy crm_so_file_remove_unused on storage.objects using(
 bucket_id='crm-sales-orders' and (storage.foldername(name))[1]=auth.uid()::text
 and private.crm_can('quotations','view') and private.crm_can('quotations','create')
 and not exists(select 1 from public.crm_sales_orders s where s.po_file_key=name));
