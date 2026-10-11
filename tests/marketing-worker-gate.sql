-- Read-only fixtures; evaluates the production predicate without calling HTTP or sending mail.
select *, expected = actual as passed from (
(with sender as (select true id, false enabled, now() verified_at), campaigns as (select 1 id, 'queued'::text status, now()+interval '-1 minute' scheduled_at where true), recipients as (select 1 campaign_id,'pending'::text status, now()+interval '-1 minute' next_attempt_at, null::timestamptz claimed_at where true) select 'disabled sender' as scenario, false as expected, (exists (
      select 1 from sender s
      where s.id and s.enabled and s.verified_at is not null
    ) and exists (
      select 1 from campaigns c
      where c.status in ('queued', 'scheduled', 'sending') and c.scheduled_at <= now()
      and (
        exists (
          select 1 from recipients r where r.campaign_id = c.id
          and ((r.status = 'pending' and r.next_attempt_at <= now())
            or (r.status = 'sending' and r.claimed_at < now() - interval '5 minutes'))
        )
        -- Refresh a campaign whose last recipient finished before a worker stopped.
        or not exists (
          select 1 from recipients r where r.campaign_id = c.id
          and r.status in ('pending', 'sending')
        )
      )
    )) as actual)
union all
(with sender as (select true id, true enabled, null::timestamptz verified_at), campaigns as (select 1 id, 'queued'::text status, now()+interval '-1 minute' scheduled_at where true), recipients as (select 1 campaign_id,'pending'::text status, now()+interval '-1 minute' next_attempt_at, null::timestamptz claimed_at where true) select 'unverified sender' as scenario, false as expected, (exists (
      select 1 from sender s
      where s.id and s.enabled and s.verified_at is not null
    ) and exists (
      select 1 from campaigns c
      where c.status in ('queued', 'scheduled', 'sending') and c.scheduled_at <= now()
      and (
        exists (
          select 1 from recipients r where r.campaign_id = c.id
          and ((r.status = 'pending' and r.next_attempt_at <= now())
            or (r.status = 'sending' and r.claimed_at < now() - interval '5 minutes'))
        )
        -- Refresh a campaign whose last recipient finished before a worker stopped.
        or not exists (
          select 1 from recipients r where r.campaign_id = c.id
          and r.status in ('pending', 'sending')
        )
      )
    )) as actual)
union all
(with sender as (select true id, true enabled, now() verified_at), campaigns as (select 1 id, null::text status, now()+interval '-1 minute' scheduled_at where false), recipients as (select 1 campaign_id,null::text status, now()+interval '-1 minute' next_attempt_at, null::timestamptz claimed_at where false) select 'no campaigns' as scenario, false as expected, (exists (
      select 1 from sender s
      where s.id and s.enabled and s.verified_at is not null
    ) and exists (
      select 1 from campaigns c
      where c.status in ('queued', 'scheduled', 'sending') and c.scheduled_at <= now()
      and (
        exists (
          select 1 from recipients r where r.campaign_id = c.id
          and ((r.status = 'pending' and r.next_attempt_at <= now())
            or (r.status = 'sending' and r.claimed_at < now() - interval '5 minutes'))
        )
        -- Refresh a campaign whose last recipient finished before a worker stopped.
        or not exists (
          select 1 from recipients r where r.campaign_id = c.id
          and r.status in ('pending', 'sending')
        )
      )
    )) as actual)
union all
(with sender as (select true id, true enabled, now() verified_at), campaigns as (select 1 id, 'scheduled'::text status, now()+interval '1 hour' scheduled_at where true), recipients as (select 1 campaign_id,'pending'::text status, now()+interval '-1 minute' next_attempt_at, null::timestamptz claimed_at where true) select 'future schedule' as scenario, false as expected, (exists (
      select 1 from sender s
      where s.id and s.enabled and s.verified_at is not null
    ) and exists (
      select 1 from campaigns c
      where c.status in ('queued', 'scheduled', 'sending') and c.scheduled_at <= now()
      and (
        exists (
          select 1 from recipients r where r.campaign_id = c.id
          and ((r.status = 'pending' and r.next_attempt_at <= now())
            or (r.status = 'sending' and r.claimed_at < now() - interval '5 minutes'))
        )
        -- Refresh a campaign whose last recipient finished before a worker stopped.
        or not exists (
          select 1 from recipients r where r.campaign_id = c.id
          and r.status in ('pending', 'sending')
        )
      )
    )) as actual)
union all
(with sender as (select true id, true enabled, now() verified_at), campaigns as (select 1 id, 'draft'::text status, now()+interval '-1 minute' scheduled_at where true), recipients as (select 1 campaign_id,'pending'::text status, now()+interval '-1 minute' next_attempt_at, null::timestamptz claimed_at where true) select 'draft campaign' as scenario, false as expected, (exists (
      select 1 from sender s
      where s.id and s.enabled and s.verified_at is not null
    ) and exists (
      select 1 from campaigns c
      where c.status in ('queued', 'scheduled', 'sending') and c.scheduled_at <= now()
      and (
        exists (
          select 1 from recipients r where r.campaign_id = c.id
          and ((r.status = 'pending' and r.next_attempt_at <= now())
            or (r.status = 'sending' and r.claimed_at < now() - interval '5 minutes'))
        )
        -- Refresh a campaign whose last recipient finished before a worker stopped.
        or not exists (
          select 1 from recipients r where r.campaign_id = c.id
          and r.status in ('pending', 'sending')
        )
      )
    )) as actual)
union all
(with sender as (select true id, true enabled, now() verified_at), campaigns as (select 1 id, 'cancelled'::text status, now()+interval '-1 minute' scheduled_at where true), recipients as (select 1 campaign_id,'pending'::text status, now()+interval '-1 minute' next_attempt_at, null::timestamptz claimed_at where true) select 'cancelled campaign' as scenario, false as expected, (exists (
      select 1 from sender s
      where s.id and s.enabled and s.verified_at is not null
    ) and exists (
      select 1 from campaigns c
      where c.status in ('queued', 'scheduled', 'sending') and c.scheduled_at <= now()
      and (
        exists (
          select 1 from recipients r where r.campaign_id = c.id
          and ((r.status = 'pending' and r.next_attempt_at <= now())
            or (r.status = 'sending' and r.claimed_at < now() - interval '5 minutes'))
        )
        -- Refresh a campaign whose last recipient finished before a worker stopped.
        or not exists (
          select 1 from recipients r where r.campaign_id = c.id
          and r.status in ('pending', 'sending')
        )
      )
    )) as actual)
union all
(with sender as (select true id, true enabled, now() verified_at), campaigns as (select 1 id, 'queued'::text status, now()+interval '-1 minute' scheduled_at where true), recipients as (select 1 campaign_id,'pending'::text status, now()+interval '-1 minute' next_attempt_at, null::timestamptz claimed_at where true) select 'queued recipient due' as scenario, true as expected, (exists (
      select 1 from sender s
      where s.id and s.enabled and s.verified_at is not null
    ) and exists (
      select 1 from campaigns c
      where c.status in ('queued', 'scheduled', 'sending') and c.scheduled_at <= now()
      and (
        exists (
          select 1 from recipients r where r.campaign_id = c.id
          and ((r.status = 'pending' and r.next_attempt_at <= now())
            or (r.status = 'sending' and r.claimed_at < now() - interval '5 minutes'))
        )
        -- Refresh a campaign whose last recipient finished before a worker stopped.
        or not exists (
          select 1 from recipients r where r.campaign_id = c.id
          and r.status in ('pending', 'sending')
        )
      )
    )) as actual)
union all
(with sender as (select true id, true enabled, now() verified_at), campaigns as (select 1 id, 'scheduled'::text status, now()+interval '-1 minute' scheduled_at where true), recipients as (select 1 campaign_id,'pending'::text status, now()+interval '-1 minute' next_attempt_at, null::timestamptz claimed_at where true) select 'scheduled recipient due' as scenario, true as expected, (exists (
      select 1 from sender s
      where s.id and s.enabled and s.verified_at is not null
    ) and exists (
      select 1 from campaigns c
      where c.status in ('queued', 'scheduled', 'sending') and c.scheduled_at <= now()
      and (
        exists (
          select 1 from recipients r where r.campaign_id = c.id
          and ((r.status = 'pending' and r.next_attempt_at <= now())
            or (r.status = 'sending' and r.claimed_at < now() - interval '5 minutes'))
        )
        -- Refresh a campaign whose last recipient finished before a worker stopped.
        or not exists (
          select 1 from recipients r where r.campaign_id = c.id
          and r.status in ('pending', 'sending')
        )
      )
    )) as actual)
union all
(with sender as (select true id, true enabled, now() verified_at), campaigns as (select 1 id, 'sending'::text status, now()+interval '-1 minute' scheduled_at where true), recipients as (select 1 campaign_id,'pending'::text status, now()+interval '10 minutes' next_attempt_at, null::timestamptz claimed_at where true) select 'provider retry in future' as scenario, false as expected, (exists (
      select 1 from sender s
      where s.id and s.enabled and s.verified_at is not null
    ) and exists (
      select 1 from campaigns c
      where c.status in ('queued', 'scheduled', 'sending') and c.scheduled_at <= now()
      and (
        exists (
          select 1 from recipients r where r.campaign_id = c.id
          and ((r.status = 'pending' and r.next_attempt_at <= now())
            or (r.status = 'sending' and r.claimed_at < now() - interval '5 minutes'))
        )
        -- Refresh a campaign whose last recipient finished before a worker stopped.
        or not exists (
          select 1 from recipients r where r.campaign_id = c.id
          and r.status in ('pending', 'sending')
        )
      )
    )) as actual)
union all
(with sender as (select true id, true enabled, now() verified_at), campaigns as (select 1 id, 'sending'::text status, now()+interval '-1 minute' scheduled_at where true), recipients as (select 1 campaign_id,'sending'::text status, now()+interval '-1 minute' next_attempt_at, now()+interval '-1 minute' claimed_at where true) select 'sending lease active' as scenario, false as expected, (exists (
      select 1 from sender s
      where s.id and s.enabled and s.verified_at is not null
    ) and exists (
      select 1 from campaigns c
      where c.status in ('queued', 'scheduled', 'sending') and c.scheduled_at <= now()
      and (
        exists (
          select 1 from recipients r where r.campaign_id = c.id
          and ((r.status = 'pending' and r.next_attempt_at <= now())
            or (r.status = 'sending' and r.claimed_at < now() - interval '5 minutes'))
        )
        -- Refresh a campaign whose last recipient finished before a worker stopped.
        or not exists (
          select 1 from recipients r where r.campaign_id = c.id
          and r.status in ('pending', 'sending')
        )
      )
    )) as actual)
union all
(with sender as (select true id, true enabled, now() verified_at), campaigns as (select 1 id, 'sending'::text status, now()+interval '-1 minute' scheduled_at where true), recipients as (select 1 campaign_id,'sending'::text status, now()+interval '-1 minute' next_attempt_at, now()+interval '-6 minutes' claimed_at where true) select 'sending lease stale' as scenario, true as expected, (exists (
      select 1 from sender s
      where s.id and s.enabled and s.verified_at is not null
    ) and exists (
      select 1 from campaigns c
      where c.status in ('queued', 'scheduled', 'sending') and c.scheduled_at <= now()
      and (
        exists (
          select 1 from recipients r where r.campaign_id = c.id
          and ((r.status = 'pending' and r.next_attempt_at <= now())
            or (r.status = 'sending' and r.claimed_at < now() - interval '5 minutes'))
        )
        -- Refresh a campaign whose last recipient finished before a worker stopped.
        or not exists (
          select 1 from recipients r where r.campaign_id = c.id
          and r.status in ('pending', 'sending')
        )
      )
    )) as actual)
union all
(with sender as (select true id, true enabled, now() verified_at), campaigns as (select 1 id, 'sending'::text status, now()+interval '-1 minute' scheduled_at where true), recipients as (select 1 campaign_id,'sent'::text status, now()+interval '-1 minute' next_attempt_at, null::timestamptz claimed_at where true) select 'final status refresh' as scenario, true as expected, (exists (
      select 1 from sender s
      where s.id and s.enabled and s.verified_at is not null
    ) and exists (
      select 1 from campaigns c
      where c.status in ('queued', 'scheduled', 'sending') and c.scheduled_at <= now()
      and (
        exists (
          select 1 from recipients r where r.campaign_id = c.id
          and ((r.status = 'pending' and r.next_attempt_at <= now())
            or (r.status = 'sending' and r.claimed_at < now() - interval '5 minutes'))
        )
        -- Refresh a campaign whose last recipient finished before a worker stopped.
        or not exists (
          select 1 from recipients r where r.campaign_id = c.id
          and r.status in ('pending', 'sending')
        )
      )
    )) as actual)
) scenarios;
