-- Keep minute-precision scheduling, but do not invoke an Edge Function when idle.
-- The predicate uses the existing queue indexes and never reads secrets into a client.
-- No sender settings, campaigns, RLS policies, or delivery permissions are changed.
do $migration$
declare
  worker_job bigint;
begin
  select jobid into worker_job from cron.job where jobname = 'kc-marketing-email-worker';
  if worker_job is null then raise exception 'Marketing email worker job not found'; end if;
  perform cron.alter_job(worker_job, command := $job$
    select net.http_post(
      url := 'https://tocsxnprspiogawignib.supabase.co/functions/v1/marketing-email',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-marketing-worker',
        (select decrypted_secret from vault.decrypted_secrets where name = 'KC_MARKETING_CRON_TOKEN')),
      body := '{"action":"worker"}'::jsonb,
      timeout_milliseconds := 55000
    )
    where exists (
      select 1 from public.crm_email_sender s
      where s.id and s.enabled and s.verified_at is not null
    ) and exists (
      select 1 from public.crm_email_campaigns c
      where c.status in ('queued', 'scheduled', 'sending') and c.scheduled_at <= now()
      and (
        exists (
          select 1 from public.crm_email_recipients r where r.campaign_id = c.id
          and ((r.status = 'pending' and r.next_attempt_at <= now())
            or (r.status = 'sending' and r.claimed_at < now() - interval '5 minutes'))
        )
        -- Refresh a campaign whose last recipient finished before a worker stopped.
        or not exists (
          select 1 from public.crm_email_recipients r where r.campaign_id = c.id
          and r.status in ('pending', 'sending')
        )
      )
    );
  $job$);
end
$migration$;
