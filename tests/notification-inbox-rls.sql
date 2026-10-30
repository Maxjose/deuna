-- Run on a database with at least two profiles. No notifications are sent.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles order by id limit 1),true);
insert into public.notification_inbox(user_id,id,title,body)
select id,'qa-inbox-isolation','QA','QA' from public.profiles order by id limit 2;
set local role authenticated;
do $$ begin
 if (select count(*) from public.notification_inbox where id='qa-inbox-isolation')<>1 then raise exception 'RLS isolation failed';end if;
 update public.notification_inbox set dismissed=true,read_at=now() where id='qa-inbox-isolation';
 if not exists(select 1 from public.notification_inbox where id='qa-inbox-isolation' and dismissed and read_at is not null) then raise exception 'Dismiss failed';end if;
 if has_column_privilege('authenticated','public.notification_inbox','title','UPDATE') or has_table_privilege('anon','public.notification_inbox','SELECT') then raise exception 'Excessive permissions';end if;
end $$;
rollback;
