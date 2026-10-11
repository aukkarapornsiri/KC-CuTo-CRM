alter table public.crm_email_sender
 add column provider text not null default 'resend' check(provider in ('resend','microsoft_graph')),
 add column notifications_enabled boolean not null default false,
 add column activated_at timestamptz,
 add column last_test_at timestamptz;
-- Prepare the requested identity without enabling any outbound mail.
update public.crm_email_sender set provider='microsoft_graph',from_email='cutocrm@kai-com.com',
 from_name=coalesce(nullif(from_name,''),'KC CuTo CRM'),reply_to='cutocrm@kai-com.com',
 postal_address=coalesce(nullif(postal_address,''),(select coalesce(nullif(company_details->>'address_th',''),company_details->>'address_en','') from public.company_settings limit 1)),
 enabled=false,notifications_enabled=true,verified_at=null,updated_at=now() where id;

create table public.crm_notification_email_queue(
 id uuid primary key default gen_random_uuid(),notification_id uuid not null unique references public.notifications(id) on delete cascade,
 user_id uuid not null references public.profiles(id),subject text not null,body text not null default '',related_module text,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','skipped')),
 attempts integer not null default 0,next_attempt_at timestamptz not null default now(),claimed_at timestamptz,sent_at timestamptz,
 provider_id text,error text,created_at timestamptz not null default now());
create index crm_notification_email_due_idx on public.crm_notification_email_queue(next_attempt_at) where status='pending';
create index crm_notification_email_user_idx on public.crm_notification_email_queue(user_id);
alter table public.crm_notification_email_queue enable row level security;
revoke all on public.crm_notification_email_queue from public,anon,authenticated;
grant select on public.crm_notification_email_queue to authenticated;
grant all on public.crm_notification_email_queue to service_role;
create policy email_queue_admin_read on public.crm_notification_email_queue for select to authenticated using(private.crm_can('activities','manage_settings'));
create table private.crm_notification_milestones(event_key text primary key,created_at timestamptz not null default now());
revoke all on private.crm_notification_milestones from public,anon,authenticated;
alter table private.crm_notification_milestones enable row level security;

create function private.crm_queue_notification_email() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.user_id is not null and exists(select 1 from public.crm_email_sender where id and provider='microsoft_graph' and notifications_enabled and verified_at is not null and new.created_at>=activated_at)
 and exists(select 1 from public.profiles p where p.id=new.user_id and p.is_active)
 then insert into public.crm_notification_email_queue(notification_id,user_id,subject,body,related_module)
 values(new.id,new.user_id,left(new.title,240),left(coalesce(new.body,''),4000),new.related_module) on conflict(notification_id) do nothing;end if;
 return new;
end $$;
revoke all on function private.crm_queue_notification_email() from public,anon,authenticated;
create trigger crm_notification_to_email after insert on public.notifications for each row execute function private.crm_queue_notification_email();

create function public.crm_notification_email_allowed(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.crm_notification_email_queue q join public.profiles p on p.id=q.user_id
 where q.id=p_id and p.is_active and public.crm_actor_can(p.id,case when q.related_module in ('leads','quotations','contracts','activities','tickets','reports') then q.related_module else 'activities' end,'view'));
$$;
create function public.crm_notification_email_claim() returns setof public.crm_notification_email_queue language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.crm_email_sender where id and notifications_enabled and verified_at is not null and provider='microsoft_graph') then return;end if;
 update public.crm_notification_email_queue set status='failed',error='Delivery outcome unknown; check Sent Items before retry' where status='sending' and claimed_at<now()-interval '5 minutes';
 return query with picked as(select id from public.crm_notification_email_queue where status='pending' and next_attempt_at<=now() order by created_at limit 5 for update skip locked)
 update public.crm_notification_email_queue q set status='sending',claimed_at=now(),attempts=attempts+1 from picked where q.id=picked.id returning q.*;
end $$;
revoke all on function public.crm_notification_email_allowed(uuid),public.crm_notification_email_claim() from public,anon,authenticated;
grant execute on function public.crm_notification_email_allowed(uuid),public.crm_notification_email_claim() to service_role;

create function private.crm_lead_assignment_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.owner_id is not null and (tg_op='INSERT' or new.owner_id is distinct from old.owner_id) then
 insert into public.notifications(user_id,type,title,body,related_module,related_id)
 values(new.owner_id,'lead','ได้รับมอบหมาย Lead: '||coalesce(new.code,''),coalesce(new.company_name,''),'leads',new.id);end if;
 return new;
end $$;
revoke all on function private.crm_lead_assignment_notification() from public,anon,authenticated;
create trigger crm_lead_assignment_notice after insert or update of owner_id on public.leads for each row execute function private.crm_lead_assignment_notification();

create function private.crm_scheduled_email_notices() returns void language plpgsql security definer set search_path='' as $$
declare r record;key text;cutoff timestamptz;today date:=(now() at time zone 'Asia/Bangkok')::date;days integer;
begin
 select activated_at into cutoff from public.crm_email_sender where id and notifications_enabled and verified_at is not null and provider='microsoft_graph';
 if cutoff is null then return;end if;
 for r in select * from public.activities where owner_id is not null and reminder_at>=cutoff and reminder_at<=now() and reminder_at>now()-interval '24 hours' and lower(status) not in ('completed','done','cancelled','canceled') loop
 key:='activity:'||r.id||':'||r.reminder_at;
 insert into private.crm_notification_milestones(event_key) values(key) on conflict do nothing;
 if found then insert into public.notifications(user_id,type,title,body,related_module,related_id) values(r.owner_id,'activity','ถึงเวลาติดตามงาน: '||r.subject,coalesce(r.next_action,r.description,''),'activities',r.id);end if;
 end loop;
 for r in select * from public.contracts where coalesce(renewal_owner_id,owner_id) is not null and end_date>=today and lower(status) not in ('cancelled','canceled','terminated','inactive') and lower(coalesce(renewal_status,''))<>'renewed' and end_date-today in (30,7,1,0) loop
 days:=r.end_date-today;key:='contract:'||r.id||':'||r.end_date||':'||days;
 insert into private.crm_notification_milestones(event_key) values(key) on conflict do nothing;
 if found then insert into public.notifications(user_id,type,title,body,related_module,related_id) values(coalesce(r.renewal_owner_id,r.owner_id),'renewal','MA / สัญญาใกล้หมดอายุ: '||coalesce(r.code,''),coalesce(r.name,'')||' · ครบกำหนด '||r.end_date||' · เหลือ '||days||' วัน','contracts',r.id);end if;
 end loop;
end $$;
revoke all on function private.crm_scheduled_email_notices() from public,anon,authenticated;
select cron.schedule('kc-cuto-email-reminders','*/15 * * * *','select private.crm_scheduled_email_notices()');
select cron.schedule('kc-cuto-notification-email-worker','* * * * *',$job$
 select net.http_post(url:='https://tocsxnprspiogawignib.supabase.co/functions/v1/marketing-email',
 headers:=jsonb_build_object('Content-Type','application/json','x-marketing-worker',(select decrypted_secret from vault.decrypted_secrets where name='KC_MARKETING_CRON_TOKEN')),
 body:='{"action":"notification_worker"}'::jsonb,timeout_milliseconds:=55000)
 where exists(select 1 from public.crm_email_sender where id and provider='microsoft_graph' and notifications_enabled and verified_at is not null)
 and exists(select 1 from public.crm_notification_email_queue where (status='pending' and next_attempt_at<=now()) or (status='sending' and claimed_at<now()-interval '5 minutes'));
$job$);
