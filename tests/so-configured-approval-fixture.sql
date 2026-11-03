create role anon;create role authenticated;create schema auth;create schema private;create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table profiles(id uuid primary key,is_active boolean default true,deleted_at timestamptz,is_super_admin boolean default false,role text,custom_role_key text,first_name text,last_name text,display_name text,email text);
create table role_permissions(role_key text,module text,can_approve boolean,can_create boolean,can_edit boolean);
create function private.crm_active_user() returns boolean language sql stable as $$select exists(select 1 from public.profiles where id=auth.uid() and is_active and deleted_at is null)$$;
create function private.crm_can(m text,a text) returns boolean language sql stable as $$select exists(select 1 from public.profiles p left join public.role_permissions r on r.role_key=p.role and r.module=m where p.id=auth.uid() and p.is_active and p.deleted_at is null and (p.is_super_admin or case a when 'view' then true when 'approve' then r.can_approve when 'edit' then r.can_edit else r.can_create end))$$;
create table crm_approval_policies(id uuid primary key default gen_random_uuid(),name text,minimum_amount numeric,approver_ids uuid[],is_active boolean,updated_at timestamptz);
create table crm_sales_orders(id uuid primary key,total numeric,owner_id uuid,created_by uuid,status text,quotation_id uuid,code text,customer_name text,updated_at timestamptz);
create table crm_so_approvals(sales_order_id uuid primary key,status text,requested_by uuid,requested_at timestamptz,reviewed_by uuid,reviewed_at timestamptz,review_note text,revision int,updated_at timestamptz,signature_storage_key text,reviewer_name text);
create table crm_so_amendments(id uuid primary key default gen_random_uuid(),sales_order_id uuid,requested_by uuid,requested_at timestamptz default now(),reason text,status text default 'pending',reviewed_by uuid,reviewed_at timestamptz,review_note text,base_updated_at timestamptz,before_snapshot jsonb,before_approval jsonb,after_snapshot jsonb);
create unique index one_amendment on crm_so_amendments(sales_order_id) where status in('pending','approved','applying');
create table crm_sales_order_events(sales_order_id uuid,action text,note text,actor_id uuid);
create table audit_logs(user_id uuid,action text,module text,record_id uuid,changes jsonb);
create table notifications(user_id uuid,type text,title text,body text,related_module text,related_id uuid,event_key text unique,event_kind text,priority text,resolved_at timestamptz,resolution text);
create table storage.objects(bucket_id text,name text,owner_id text,metadata jsonb);
create table crm_sales_signature_defaults(user_id uuid primary key,storage_key text);
CREATE OR REPLACE FUNCTION private.crm_so_amendment_action(p_sales_order_id uuid, p_action text, p_note text, p_expected_updated_at timestamp with time zone, p_request_id uuid)
 RETURNS crm_so_amendments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.crm_sales_orders;a public.crm_so_amendments;u uuid:=auth.uid();begin
 if u is null or not private.crm_active_user() or not private.crm_can('quotations','view') then raise insufficient_privilege using message='SO access denied';end if;
 select * into s from public.crm_sales_orders where id=p_sales_order_id for update;
 if not found then raise exception 'Sales order not found';end if;
 if p_action='request' then
  if not private.crm_can('quotations','edit') or (s.owner_id<>u and s.created_by<>u and not private.crm_can('quotations','approve')) then raise insufficient_privilege using message='Only the responsible user can request an SO amendment';end if;
  if s.status='cancelled' then raise exception 'Cancelled SO cannot be amended';end if;
  if s.updated_at is distinct from p_expected_updated_at then raise exception 'Sales order changed; reload before continuing';end if;
  if length(btrim(coalesce(p_note,''))) not between 3 and 2000 then raise exception 'Amendment reason must be 3 to 2000 characters';end if;
  if exists(select 1 from public.crm_so_approvals where sales_order_id=s.id and status='pending') then raise exception 'Finish the pending SO approval first';end if;
  select * into a from public.crm_so_amendments where sales_order_id=s.id and status in ('pending','approved') for update;
  if found then if a.requested_by=u then return a;else raise exception 'An amendment is already open';end if;end if;
  insert into public.crm_so_amendments(sales_order_id,requested_by,reason,base_updated_at,before_snapshot,before_approval)
   values(s.id,u,btrim(p_note),s.updated_at,to_jsonb(s),(select to_jsonb(x) from public.crm_so_approvals x where x.sales_order_id=s.id)) returning * into a;
 else
  select * into a from public.crm_so_amendments where id=p_request_id and sales_order_id=s.id for update;
  if not found then raise exception 'Amendment request not found';end if;
  if p_action='cancel' then
   if a.requested_by<>u or a.status not in ('pending','approved') then raise insufficient_privilege using message='Cannot withdraw this amendment';end if;
   update public.crm_so_amendments set status='cancelled' where id=a.id returning * into a;
  elsif p_action in ('approve','reject') then
   if not private.crm_can('quotations','approve') or a.requested_by=u then raise insufficient_privilege using message='Independent SO approver required';end if;
   if a.status<>'pending' then raise exception 'Amendment is no longer pending';end if;
   if s.status='cancelled' or s.updated_at is distinct from a.base_updated_at then raise exception 'Sales order changed; withdraw and request again';end if;
   if p_action='reject' and length(btrim(coalesce(p_note,'')))<3 then raise exception 'Rejection reason required';end if;
   update public.crm_so_amendments set status=case p_action when 'approve' then 'approved' else 'rejected' end,
    reviewed_by=u,reviewed_at=clock_timestamp(),review_note=left(coalesce(p_note,''),2000) where id=a.id returning * into a;
  else raise exception 'Invalid amendment action';end if;
 end if;
 insert into public.crm_sales_order_events(sales_order_id,action,note,actor_id) values(s.id,'amendment_'||p_action,left(coalesce(p_note,''),2000),u);
 insert into public.audit_logs(user_id,action,module,record_id,changes) values(u,'update','quotations',s.quotation_id,jsonb_build_object('sales_order_id',s.id,'amendment_id',a.id,'amendment_action',p_action));
 return a;
end $function$
;
CREATE OR REPLACE FUNCTION private.crm_so_amendment_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.crm_sales_orders;dest uuid;begin
 select * into s from public.crm_sales_orders where id=new.sales_order_id;
 if tg_op='UPDATE' and new.status=old.status then return null;end if;
 if new.status='pending' then
  for dest in select p.id from public.profiles p left join public.role_permissions r
   on r.role_key=case when p.role='custom' then p.custom_role_key else p.role end and r.module='quotations'
   where p.is_active and p.deleted_at is null and p.id<>new.requested_by and (p.is_super_admin or coalesce(r.can_approve,false))
  loop
   insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority)
   values(dest,'approval','ขอแก้ไข SO / Request SO amendment • '||s.code,new.reason,'quotations',s.quotation_id,
    'so-amendment:'||new.id||':pending:'||dest,'approval_requested','high') on conflict do nothing;
  end loop;
 else
  update public.notifications set resolved_at=clock_timestamp(),resolution=new.status where resolved_at is null and event_key like 'so-amendment:'||new.id||':pending:%';
  if new.status in ('approved','rejected') then
   insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority)
   values(new.requested_by,'approval','ผลคำขอแก้ไข SO / SO amendment '||new.status||' • '||s.code,
    new.review_note,'quotations',s.quotation_id,'so-amendment:'||new.id||':'||new.status,'approval_resolved','high') on conflict do nothing;
  end if;
 end if;return null;
end $function$
;
CREATE OR REPLACE FUNCTION private.crm_so_approval_action(p_sales_order_id uuid, p_action text, p_note text DEFAULT ''::text)
 RETURNS crm_so_approvals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.crm_sales_orders; a public.crm_so_approvals; u uuid:=auth.uid();
begin
 if u is null or not private.crm_active_user() then raise exception 'Login required' using errcode='42501'; end if;
 if p_action not in ('request','approve','reject') then raise exception 'Invalid approval action'; end if;
 select * into o from public.crm_sales_orders where id=p_sales_order_id for update;
 if not found then raise exception 'Sales order not found'; end if;
 if o.status='cancelled' or (o.status in ('completed','delivered') and not exists(select 1 from public.crm_so_amendments m where m.sales_order_id=o.id and m.status='applied' and (m.after_snapshot->>'updated_at')::timestamptz=o.updated_at)) then raise exception 'Sales order is not eligible for approval'; end if;
 if p_action='request' then
  if not (private.crm_can('quotations','create') and (o.owner_id=u or o.created_by=u)) and not private.crm_can('quotations','approve') then
   raise exception 'Not allowed to request approval' using errcode='42501';
  end if;
  select * into a from public.crm_so_approvals where sales_order_id=p_sales_order_id for update;
  if found and a.status='approved' then raise exception 'Sales order already approved'; end if;
  if found and a.status='pending' then return a; end if;
  insert into public.crm_so_approvals(sales_order_id,requested_by,revision,status,requested_at,review_note,reviewed_by,reviewed_at,updated_at)
  values(p_sales_order_id,u,coalesce(a.revision,0)+1,'pending',now(),' ',null,null,now())
  on conflict(sales_order_id) do update set
    status='pending',requested_by=excluded.requested_by,requested_at=now(),
    reviewed_by=null,reviewed_at=null,review_note='',revision=public.crm_so_approvals.revision+1,updated_at=now()
  returning * into a;
 else
  if not private.crm_can('quotations','approve') then raise exception 'SO approve permission required' using errcode='42501'; end if;
  select * into a from public.crm_so_approvals where sales_order_id=p_sales_order_id for update;
  if a.requested_by=u and exists(select 1 from public.crm_so_amendments m where m.sales_order_id=o.id and m.status='applied') then raise insufficient_privilege using message='Independent SO approver required';end if;
  if not found or a.status<>'pending' then raise exception 'SO has no pending approval'; end if;
  if p_action='reject' and length(btrim(coalesce(p_note,'')))<3 then raise exception 'Rejection reason required'; end if;
  update public.crm_so_approvals set status=case when p_action='approve' then 'approved' else 'rejected' end,
  reviewed_by=u,reviewed_at=now(),review_note=left(coalesce(p_note,''),2000),updated_at=now()
  where sales_order_id=p_sales_order_id returning * into a;
 end if;
 insert into public.crm_sales_order_events(sales_order_id,action,note,actor_id)
 values(p_sales_order_id,'so_approval_'||p_action,coalesce(p_note,''),u);
 insert into public.audit_logs(user_id,action,module,record_id,changes)
 values(u,'update','quotations',o.quotation_id,
 jsonb_build_object('sales_order_id',o.id,'approval_action',p_action,'status',a.status,'revision',a.revision,'note',left(coalesce(p_note,''),2000)));
 return a;
end $function$
;
CREATE OR REPLACE FUNCTION private.crm_so_approval_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.crm_sales_orders; dest uuid; title text; msg text; approver record;
begin
 if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
 select * into o from public.crm_sales_orders where id=new.sales_order_id;
 if o.id is null then return new; end if;
 if new.status='pending' then
  title:='SO approval requested • '||o.code;
  msg:='Sales Order '||o.code||' for '||o.customer_name||' requires approval. Open KC CuTo CRM > Sales Orders.';
  for approver in select p.id
    from public.profiles p
    left join public.role_permissions rp
      on rp.role_key=case when p.role='custom' then p.custom_role_key else p.role end
     and rp.module='quotations'
    where p.is_active=true and p.deleted_at is null
      and (p.is_super_admin=true or coalesce(rp.can_approve,false)=true)
      and p.id<>new.requested_by
  loop
    insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority)
    values(approver.id,'approval',title,msg,'quotations',o.quotation_id,
      'so-approval:'||new.sales_order_id||':'||new.revision||':pending:'||approver.id,
      'approval_requested','high')
    on conflict do nothing;
  end loop;
 else
  title:=case when new.status='approved' then 'SO approved • ' else 'SO rejected • ' end||o.code;
  msg:='Sales Order '||o.code||' was '||new.status||'. '||coalesce(new.review_note,'');
  for dest in select distinct id from (values(new.requested_by),(o.owner_id),(o.created_by)) t(id)
    where id is not null and id is distinct from new.reviewed_by
  loop
   insert into public.notifications(user_id,type,title,body,related_module,related_id,event_key,event_kind,priority)
   values(dest,'approval',title,msg,'quotations',o.quotation_id,
    'so-approval:'||new.sales_order_id||':'||new.revision||':'||new.status||':'||dest,
    'approval_resolved','high')
   on conflict do nothing;
  end loop;
 end if;
 return new;
end $function$
;
create function public.crm_so_approval_action(p_sales_order_id uuid,p_action text,p_note text default '') returns crm_so_approvals language sql as $$select private.crm_so_approval_action(p_sales_order_id,p_action,p_note)$$;
create function public.crm_so_amendment_action(p_sales_order_id uuid,p_action text,p_note text default '',p_expected_updated_at timestamptz default null,p_request_id uuid default null) returns crm_so_amendments language sql as $$select private.crm_so_amendment_action(p_sales_order_id,p_action,p_note,p_expected_updated_at,p_request_id)$$;
create trigger crm_so_approval_notify_change after insert or update on crm_so_approvals for each row execute function private.crm_so_approval_notify();
create trigger crm_so_amendment_notify after insert or update on crm_so_amendments for each row execute function private.crm_so_amendment_notify();
insert into profiles(id,role,is_super_admin,display_name) values
 ('00000000-0000-4000-8000-000000000001','admin',true,'Admin'),
 ('00000000-0000-4000-8000-000000000002','reviewer',false,'Second'),
 ('00000000-0000-4000-8000-000000000003','reviewer',false,'Other'),
 ('00000000-0000-4000-8000-000000000004','seller',false,'Seller');
insert into role_permissions values('seller','quotations',false,true,true),('reviewer','quotations',true,true,true);
insert into crm_sales_orders values('00000000-0000-4000-8000-000000000010',1000,'00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004','confirmed','00000000-0000-4000-8000-000000000011','SO-TEST','Test',now());

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
