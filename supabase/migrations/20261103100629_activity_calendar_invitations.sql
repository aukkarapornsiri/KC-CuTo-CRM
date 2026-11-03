-- Additive scheduling fields; existing activities and permissions stay intact.
alter table public.activities
 add column if not exists ended_at timestamptz,
 add column if not exists attendee_emails text[] not null default '{}',
 add column if not exists calendar_enabled boolean not null default true,
 add column if not exists teams_enabled boolean,
 add column if not exists location text not null default '',
 add column if not exists reminder_minutes integer not null default 15;
alter table public.activities add constraint activities_calendar_end_after_start check (ended_at is null or ended_at>scheduled_at);
alter table public.activities add constraint activities_calendar_attendee_limit check (cardinality(attendee_emails)<=100);
alter table public.activities add constraint activities_calendar_reminder_range check (reminder_minutes between 0 and 40320);
