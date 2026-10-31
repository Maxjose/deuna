create table private.availability_settings (
 id boolean primary key default true check(id),
 signal_minutes integer not null default 5 check(signal_minutes between 2 and 60),
 idle_minutes integer not null default 30 check(idle_minutes between 5 and 240),
 grace_minutes integer not null default 2 check(grace_minutes between 1 and 15)
);
insert into private.availability_settings(id) values(true);
create table private.driver_presence (
 driver_id uuid primary key references public.profiles(id) on delete cascade,
 last_seen timestamptz not null default now(),
 last_activity timestamptz not null default now(),
 reason text check(reason in ('signal','idle'))
);
alter table private.availability_settings enable row level security;
alter table private.driver_presence enable row level security;
revoke all on private.availability_settings,private.driver_presence from public,anon,authenticated;
insert into private.driver_presence(driver_id) select id from public.profiles where role='driver';

create function private.reset_driver_presence() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role='driver' and new.available and (not old.available or old.role<>'driver') then
  insert into private.driver_presence(driver_id) values(new.id) on conflict(driver_id) do update set last_seen=now(),last_activity=now(),reason=null;
 end if;
 return new;
end $$;
create trigger reset_driver_presence after update on public.profiles for each row execute function private.reset_driver_presence();
create function private.reset_presence_after_trip() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status in ('assigned','arrived','ongoing') and new.status in ('finished','cancelled') then
  update private.driver_presence set last_seen=now(),last_activity=now(),reason=null where driver_id=new.driver_id;
 end if;
 return new;
end $$;
create trigger reset_presence_after_trip after update of status on public.trips for each row execute function private.reset_presence_after_trip();

create function private.expire_driver_presence(driver uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(4173001);
 with expired as (
  update private.driver_presence d set reason=case when d.last_seen<=now()-make_interval(mins=>s.signal_minutes) then 'signal' else 'idle' end
  from private.availability_settings s,public.profiles p
  where p.id=d.driver_id and p.available and p.role='driver' and (driver is null or p.id=driver)
  and (d.last_seen<=now()-make_interval(mins=>s.signal_minutes) or d.last_activity<=now()-make_interval(mins=>s.idle_minutes+s.grace_minutes))
  and not exists(select 1 from public.trips t where t.driver_id=d.driver_id and t.status in ('assigned','arrived','ongoing'))
  returning d.driver_id
 ) update public.profiles set available=false where id in (select driver_id from expired);
end $$;

create function private.driver_presence_api(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();p public.profiles;s private.availability_settings;d private.driver_presence;occupied boolean;
begin
 if uid is null then raise exception 'No autorizado';end if;
 perform pg_advisory_xact_lock(4173001);
 select * into strict p from public.profiles where id=uid;
 if p.suspended then raise exception 'Cuenta suspendida';end if;
 if action in ('settings','save') then
  if p.role<>'admin' then raise exception 'No autorizado';end if;
  if action='save' then
   if payload is null or not (payload ?& array['signal_minutes','idle_minutes','grace_minutes']) then raise exception 'Configuracion requerida';end if;
   update private.availability_settings set signal_minutes=(payload->>'signal_minutes')::integer,idle_minutes=(payload->>'idle_minutes')::integer,grace_minutes=(payload->>'grace_minutes')::integer;
  end if;
  return (select to_jsonb(x)-'id' from private.availability_settings x);
 end if;
 if p.role<>'driver' or not p.approved or action not in ('heartbeat','confirm') then raise exception 'No autorizado';end if;
 select * into strict s from private.availability_settings;
 -- Expiration precedes a late heartbeat: returning to the app never reconnects a driver.
 perform private.expire_driver_presence(uid);
 select * into strict p from public.profiles where id=uid;
 select exists(select 1 from public.trips where driver_id=uid and status in ('assigned','arrived','ongoing')) into occupied;
 select * into d from private.driver_presence where driver_id=uid;
 if p.available then
  update private.driver_presence set last_seen=now(),
   last_activity=case when occupied or action='confirm' or (payload->>'activity'='true' and last_activity>now()-make_interval(mins=>s.idle_minutes)) then now() else last_activity end
   where driver_id=uid returning * into d;
 end if;
 return jsonb_build_object('available',p.available,'reason',d.reason,'confirmation_due',p.available and not occupied and d.last_activity<=now()-make_interval(mins=>s.idle_minutes),
  'deadline',d.last_activity+make_interval(mins=>s.idle_minutes+s.grace_minutes));
end $$;
revoke all on function private.reset_driver_presence(),private.reset_presence_after_trip(),private.expire_driver_presence(uuid),private.driver_presence_api(text,jsonb) from public,anon,authenticated;
grant execute on function private.driver_presence_api(text,jsonb) to authenticated;
create function public.driver_presence(action text,payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.driver_presence_api(action,payload)$$;
revoke all on function public.driver_presence(text,jsonb) from public,anon;
grant execute on function public.driver_presence(text,jsonb) to authenticated;

-- Reject acceptance after expiry even between scheduled cleanup runs.
do $$declare definition text;marker text:='if action=''accept'' then';begin
 select pg_get_functiondef('private.operate(text,jsonb)'::regprocedure) into definition;
 if position(marker in definition)=0 then raise exception 'Missing accept insertion point';end if;
 definition:=replace(definition,marker,marker||'
   if not exists(select 1 from private.driver_presence d cross join private.availability_settings c where d.driver_id=uid and d.last_seen>now()-make_interval(mins=>c.signal_minutes) and d.last_activity>now()-make_interval(mins=>c.idle_minutes+c.grace_minutes)) then raise exception ''Disponibilidad vencida'';end if;');
 execute definition;
end $$;
select cron.schedule('de1na-driver-availability','* * * * *','select private.expire_driver_presence()');
