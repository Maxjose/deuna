create table public.notification_inbox (
 user_id uuid not null references public.profiles(id) on delete cascade,
 id text not null, title text not null, body text not null,
 created_at timestamptz not null default now(), read_at timestamptz,
 dismissed boolean not null default false, primary key(user_id,id)
);
alter table public.notification_inbox enable row level security;
revoke all on public.notification_inbox from public,anon,authenticated;
grant select on public.notification_inbox to authenticated;
grant update(read_at,dismissed) on public.notification_inbox to authenticated;
create policy inbox_select on public.notification_inbox for select to authenticated using(user_id=(select auth.uid()));
create policy inbox_update on public.notification_inbox for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create index notification_inbox_recent on public.notification_inbox(user_id,created_at desc) where not dismissed;
create function private.record_notification_inbox() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='sent' and old.status is distinct from 'sent' then
  insert into public.notification_inbox(user_id,id,title,body,created_at)
  values(new.recipient_id,coalesce(new.campaign_id::text,case when new.trip_id is not null then new.trip_id::text||':'||new.trip_status end,new.id::text),new.title,new.body,new.created_at)
  on conflict(user_id,id) do nothing;
 end if;
 return new;
end $$;
revoke all on function private.record_notification_inbox() from public,anon,authenticated;
create trigger record_notification_inbox after update of status on private.push_jobs for each row execute function private.record_notification_inbox();
-- Preserve previously sent notices without sending them again.
insert into public.notification_inbox(user_id,id,title,body,created_at)
select distinct on(recipient_id,coalesce(campaign_id::text,case when trip_id is not null then trip_id::text||':'||trip_status end,id::text))
 recipient_id,coalesce(campaign_id::text,case when trip_id is not null then trip_id::text||':'||trip_status end,id::text),title,body,created_at
from private.push_jobs where status='sent' on conflict(user_id,id) do nothing;
