alter table private.driver_presence add column vip boolean not null default false;

-- Preserve the existing account, trip and plan checks; only exempt presence expiry.
do $migration$
declare definition text; changed text; signature text;
begin
 foreach signature in array array['private.expire_driver_presence(uuid)','private.operate(text,jsonb)','private.service_is_open(time)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  if signature='private.expire_driver_presence(uuid)' then
   changed:=replace(definition,'where p.id=d.driver_id and p.available','where not d.vip and p.id=d.driver_id and p.available');
  elsif signature='private.operate(text,jsonb)' then
   changed:=replace(definition,'d.driver_id=uid and d.last_seen>now()-make_interval(mins=>c.signal_minutes) and d.last_activity>now()-make_interval(mins=>c.idle_minutes+c.grace_minutes)',
    'd.driver_id=uid and (d.vip or (d.last_seen>now()-make_interval(mins=>c.signal_minutes) and d.last_activity>now()-make_interval(mins=>c.idle_minutes+c.grace_minutes)))');
  else
   changed:=replace(definition,'and d.last_seen>now()-make_interval(mins=>c.signal_minutes)'||chr(10)||'   and d.last_activity>now()-make_interval(mins=>c.idle_minutes+c.grace_minutes)',
    'and (d.vip or (d.last_seen>now()-make_interval(mins=>c.signal_minutes) and d.last_activity>now()-make_interval(mins=>c.idle_minutes+c.grace_minutes)))');
  end if;
  if changed=definition then raise exception 'Missing VIP insertion point: %',signature;end if;
  execute changed;
 end loop;
end $migration$;

create or replace function private.driver_presence_api(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();p public.profiles;s private.availability_settings;d private.driver_presence;occupied boolean;target uuid;
begin
 if uid is null then raise exception 'No autorizado';end if;
 perform pg_advisory_xact_lock(4173001);
 select * into strict p from public.profiles where id=uid;
 if p.suspended then raise exception 'Cuenta suspendida';end if;
 if action in ('vip_get','vip_save') then
  if p.role<>'admin' then raise exception 'No autorizado';end if;
  target:=(payload->>'driver_id')::uuid;
  if not exists(select 1 from public.profiles where id=target and role='driver') then raise exception 'Conductor no encontrado';end if;
  if action='vip_save' then
   if jsonb_typeof(payload->'enabled') is distinct from 'boolean' then raise exception 'Estado requerido';end if;
   insert into private.driver_presence(driver_id,vip) values(target,(payload->>'enabled')::boolean)
   on conflict(driver_id) do update set vip=excluded.vip,last_seen=now(),last_activity=now(),reason=null;
  end if;
  return jsonb_build_object('enabled',coalesce((select vip from private.driver_presence where driver_id=target),false));
 end if;
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
 perform private.expire_driver_presence(uid);
 select * into strict p from public.profiles where id=uid;
 select exists(select 1 from public.trips where driver_id=uid and status in ('assigned','arrived','ongoing')) into occupied;
 select * into d from private.driver_presence where driver_id=uid;
 if p.available then
  update private.driver_presence set last_seen=now(),
   last_activity=case when occupied or action='confirm' or (payload->>'activity'='true' and last_activity>now()-make_interval(mins=>s.idle_minutes)) then now() else last_activity end
   where driver_id=uid returning * into d;
 end if;
 return jsonb_build_object('available',p.available,'reason',d.reason,'vip',coalesce(d.vip,false),'confirmation_due',p.available and not coalesce(d.vip,false) and not occupied and d.last_activity<=now()-make_interval(mins=>s.idle_minutes),
  'deadline',d.last_activity+make_interval(mins=>s.idle_minutes+s.grace_minutes));
end $$;
