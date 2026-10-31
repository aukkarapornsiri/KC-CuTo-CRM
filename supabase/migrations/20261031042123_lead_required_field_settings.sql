-- Configuration is additive; historical lead records are never rewritten.
create table public.crm_lead_field_rules(
 id integer primary key check(id=1),
 rules jsonb not null,
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id)
);
insert into public.crm_lead_field_rules(id,rules) values(1,'{"Company":["company_name","last_name"],"Individual":["last_name"]}');
alter table public.crm_lead_field_rules enable row level security;
grant select,update on public.crm_lead_field_rules to authenticated;
create policy lead_field_rules_read on public.crm_lead_field_rules for select to authenticated using(private.crm_active_user() and (private.crm_can('leads','create') or private.crm_can('leads','view') or private.crm_can('leads','import') or private.crm_can('settings','manage_settings')));
create policy lead_field_rules_update on public.crm_lead_field_rules for update to authenticated using(private.crm_can('settings','manage_settings')) with check(private.crm_can('settings','manage_settings'));
create table public.crm_lead_field_rule_history(id bigint generated always as identity primary key,version integer not null,rules jsonb not null,changed_at timestamptz not null default now(),changed_by uuid references public.profiles(id));
alter table public.crm_lead_field_rule_history enable row level security;
grant select on public.crm_lead_field_rule_history to authenticated;
create policy lead_field_history_read on public.crm_lead_field_rule_history for select to authenticated using(private.crm_can('settings','manage_settings'));
create function private.crm_validate_lead_field_rules() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; field text; allowed text[]:=array['company_name','tax_id','salutation','first_name','last_name','position','phone','mobile','email','website','line_id','source','product_interest','budget','lead_assigner_id','mailing_country','mailing_street','mailing_city','mailing_state','mailing_postal_code','next_action','note'];
begin
 if not private.crm_can('settings','manage_settings') then raise insufficient_privilege;end if;
 if new.id<>old.id or new.version<>old.version+1 then raise exception 'Invalid settings version';end if;
 if jsonb_typeof(new.rules)<>'object' or not(new.rules ?& array['Company','Individual']) or (new.rules - 'Company' - 'Individual')<>'{}'::jsonb then raise exception 'Invalid lead rules';end if;
 foreach kind in array array['Company','Individual'] loop
  if jsonb_typeof(new.rules->kind)<>'array' then raise exception 'Invalid lead rules';end if;
  for field in select jsonb_array_elements_text(new.rules->kind) loop
   if field is null or not(field=any(allowed)) or (kind='Individual' and field='company_name') then raise exception 'Unsupported required field: %',field;end if;
  end loop;
  if (select count(*) from jsonb_array_elements_text(new.rules->kind))<>(select count(distinct x) from jsonb_array_elements_text(new.rules->kind) x) then raise exception 'Duplicate required fields';end if;
 end loop;
 new.updated_by:=auth.uid();new.updated_at:=clock_timestamp();
 insert into public.crm_lead_field_rule_history(version,rules,changed_by) values(new.version,new.rules,auth.uid());
 return new;
end $$;
revoke all on function private.crm_validate_lead_field_rules() from public,anon,authenticated;
create trigger crm_lead_field_rules_validate before update on public.crm_lead_field_rules for each row execute function private.crm_validate_lead_field_rules();
-- Internal trigger reads rules regardless of the caller's table-read privilege.
-- Lead INSERT authorization remains enforced by the existing leads RLS/API.
create function private.crm_require_new_lead_fields() returns trigger language plpgsql security definer set search_path='' as $$
declare rules jsonb;field text;payload jsonb:=to_jsonb(new);value text;missing text[]:=array[]::text[];
begin
 select r.rules into rules from public.crm_lead_field_rules r where id=1;
 if rules is null then raise exception 'Lead form settings unavailable';end if;
 for field in select jsonb_array_elements_text(rules->case when new.lead_type='Individual' then 'Individual' else 'Company' end) loop
  value:=payload->>field;
  if field='mailing_street' then value:=coalesce(nullif(btrim(payload->>'mailing_street_th'),''),nullif(btrim(payload->>'mailing_street_en'),''),value);end if;
  if coalesce(btrim(value),'')='' then missing:=array_append(missing,field);end if;
 end loop;
 if cardinality(missing)>0 then raise exception using errcode='23514',message='Required lead fields / กรุณากรอกข้อมูล: '||array_to_string(missing,', ');end if;
 return new;
end $$;
revoke all on function private.crm_require_new_lead_fields() from public,anon,authenticated;
create trigger zz_crm_lead_required_fields before insert on public.leads for each row execute function private.crm_require_new_lead_fields();
-- Keep the import endpoint's existing authorization and batch behavior; expose
-- the same editable lead fields as the form so configured requirements are fillable.
create or replace function private.crm_import_records(p_table text,p_rows jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare m text;columns_sql text;allowed text[];row jsonb;n integer:=0;
begin
 m:=case when p_table='master_data_items' then 'settings' else p_table end;
 if p_table not in ('customers','contacts','leads','master_data_items') or not private.crm_can(m,'import') then raise insufficient_privilege using message='Import permission required';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text)>2000000 then raise exception 'Invalid import batch';end if;
 allowed:=case p_table when 'customers' then array['name','name_en','phone','email','tax_id','website','address','province'] when 'contacts' then array['name','company','position','department','phone','email','line_id'] when 'leads' then array['lead_type','company_name','tax_id','salutation','first_name','last_name','position','phone','mobile','email','website','line_id','source','product_interest','budget','lead_assigner_id','mailing_country','mailing_street','mailing_city','mailing_state','mailing_postal_code','next_action','note','contact_name','mailing_street_th','mailing_street_en'] else array['category','code','name_th','name_en','sort_order','status'] end;
 for row in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(row) is distinct from 'object' or exists(select 1 from jsonb_object_keys(row) k where not k=any(allowed)) then raise exception 'Unsupported import fields';end if;
  if p_table='leads' then
   if coalesce(row->>'lead_type','')='' then row:=row||jsonb_build_object('lead_type','Company');end if;
   if row->>'lead_type' not in ('Company','Individual') then raise exception 'Invalid lead type';end if;
   if row->>'lead_assigner_id'='' then row:=row||jsonb_build_object('lead_assigner_id',null);end if;
   -- Preserve legacy CSV support where the single contact name was provided.
   if not(row ? 'last_name') and coalesce(row->>'contact_name','')<>'' then row:=row||jsonb_build_object('last_name',row->>'contact_name');end if;
  end if;
  if p_table<>'master_data_items' then row:=row||jsonb_build_object('owner_id',auth.uid(),'owner_name',(select display_name from public.profiles where id=auth.uid()));end if;
  select string_agg(format('%I',k),',' order by k) into columns_sql from jsonb_object_keys(row) k;
  if columns_sql is null then raise exception 'Empty record';end if;
  execute format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1)',p_table,columns_sql,columns_sql,p_table) using row;
  n:=n+1;
 end loop;return n;
end $$;
revoke all on function private.crm_import_records(text,jsonb) from public,anon;
grant execute on function private.crm_import_records(text,jsonb) to authenticated;
