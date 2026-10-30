create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
-- Anonymous dispatch uses a dedicated worker token; no table access is granted.
grant usage on schema private to anon;

create table private.push_config (
 id integer primary key check(id=1), worker_key text not null,
 dispatch_url text not null, enabled boolean not null default false
);
insert into private.push_config values(1,encode(extensions.gen_random_bytes(32),'hex'),'https://deuna-five.vercel.app/api/push/dispatch',false);
create table private.push_devices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<=2048 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com)/[^[:space:]]+$'),
 p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87}$'),
 auth text not null check(auth ~ '^[A-Za-z0-9_-]{22}$'),
 promotions boolean not null default false, created_at timestamptz not null default now()
);
create index push_devices_user on private.push_devices(user_id);
create table private.push_campaigns (
 id uuid primary key, created_by uuid not null references public.profiles(id),
 title text not null check(length(trim(title)) between 1 and 80),
 body text not null check(length(trim(body)) between 1 and 240),
 audience text not null check(audience in ('all','passenger','driver')),
 created_at timestamptz not null default now()
);
create table private.push_jobs (
 id uuid primary key default gen_random_uuid(), device_id uuid references private.push_devices(id) on delete set null,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 campaign_id uuid references private.push_campaigns(id) on delete cascade,
 trip_id uuid references public.trips(id) on delete cascade, trip_status text,
 kind text not null check(kind in ('trip','promotion','test')),
 title text not null, body text not null, tag text not null,
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','skipped')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 expires_at timestamptz not null, lease uuid, locked_until timestamptz,
 created_at timestamptz not null default now(), last_code integer,
 unique(campaign_id,device_id)
);
create index push_jobs_due on private.push_jobs(available_at) where status in ('pending','processing');
create index push_jobs_campaign on private.push_jobs(campaign_id);
create index push_jobs_device on private.push_jobs(device_id);
create index push_jobs_recipient on private.push_jobs(recipient_id);
create index push_jobs_trip on private.push_jobs(trip_id);
alter table private.push_config enable row level security;
alter table private.push_devices enable row level security;
alter table private.push_campaigns enable row level security;
alter table private.push_jobs enable row level security;
revoke all on private.push_config,private.push_devices,private.push_campaigns,private.push_jobs from public,anon,authenticated;

create function private.wake_push() returns void language plpgsql security definer set search_path='' as $$
declare config private.push_config;
begin
 select * into strict config from private.push_config where id=1;
 if config.enabled and exists(select 1 from private.push_jobs where status in ('pending','processing') and available_at<=now()) then
   perform net.http_post(url:=config.dispatch_url,body:='{}'::jsonb,
     headers:=jsonb_build_object('Content-Type','application/json','x-push-key',config.worker_key),timeout_milliseconds:=90000);
 end if;
exception when others then raise log 'Push wake failed: %',SQLSTATE;
end;$$;
revoke all on function private.wake_push() from public,anon,authenticated;

create function private.push_manage(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); device private.push_devices; campaign private.push_campaigns;
 result jsonb; target text; total integer; request_id uuid;
begin
 if uid is null then raise exception 'Inicia sesion';end if;
 if action in ('info','subscribe','unsubscribe','preferences','test') then
   select * into device from private.push_devices where endpoint=payload->>'endpoint' and user_id=uid;
   if action='info' then return jsonb_build_object('enabled',device.id is not null,'promotions',coalesce(device.promotions,false));end if;
   if action='subscribe' then
     -- Possession of an unguessable browser subscription permits rebinding a shared device.
     insert into private.push_devices(user_id,endpoint,p256dh,auth,promotions)
     values(uid,payload->>'endpoint',payload->'keys'->>'p256dh',payload->'keys'->>'auth',false)
     on conflict(endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,
       promotions=case when push_devices.user_id=uid then push_devices.promotions else false end
     returning * into device;
     return jsonb_build_object('enabled',true,'promotions',device.promotions);
   end if;
   if action='unsubscribe' then
     delete from private.push_devices where id=device.id;
     return '{}'::jsonb;
   end if;
   if device.id is null then raise exception 'Activa las notificaciones en este dispositivo';end if;
   if action='preferences' then
     update private.push_devices set promotions=coalesce((payload->>'promotions')::boolean,false) where id=device.id;
     return '{}'::jsonb;
   end if;
   if exists(select 1 from private.push_jobs where recipient_id=uid and kind='test' and created_at>now()-interval '30 seconds') then raise exception 'Espera unos segundos antes de repetir la prueba';end if;
   insert into private.push_jobs(device_id,recipient_id,kind,title,body,tag,expires_at)
   values(device.id,uid,'test','De1na','Las notificaciones de este dispositivo están activas.','de1na-test',now()+interval '5 minutes');
   perform private.wake_push();
   return '{}'::jsonb;
 end if;
 if (select role from public.profiles where id=uid) is distinct from 'admin' then raise exception 'Solo administradores';end if;
 if action='history' then
   select coalesce(jsonb_agg(row_to_json(c)),'[]'::jsonb) into result from (
     select p.id,p.title,p.body,p.audience,p.created_at,
       count(j.id) as total,count(j.id) filter(where j.status='sent') as sent,
       count(j.id) filter(where j.status='failed') as failed,
       count(j.id) filter(where j.status='skipped') as skipped,
       count(j.id) filter(where j.status in ('pending','processing')) as pending
     from private.push_campaigns p left join private.push_jobs j on j.campaign_id=p.id
     group by p.id order by p.created_at desc limit 20
   )c;
   return result;
 end if;
 target:=payload->>'audience';
 if target is null or target not in ('all','passenger','driver') then raise exception 'Publico invalido';end if;
 if action='preview' then
   select jsonb_build_object('devices',count(*),'users',count(distinct d.user_id)) into result
   from private.push_devices d join public.profiles p on p.id=d.user_id
   where d.promotions and (target='all' or p.role=target);
   return result;
 end if;
 if action<>'campaign' then raise exception 'Accion invalida';end if;
 request_id:=(payload->>'id')::uuid;
 if request_id is null then raise exception 'Identificador requerido';end if;
 perform pg_advisory_xact_lock(4173002);
 select * into campaign from private.push_campaigns where id=request_id;
 if campaign.id is not null then
   if campaign.created_by<>uid or campaign.title is distinct from trim(payload->>'title') or campaign.body is distinct from trim(payload->>'body') or campaign.audience<>target then raise exception 'Identificador ya utilizado';end if;
   return jsonb_build_object('id',campaign.id,'queued',(select count(*) from private.push_jobs where campaign_id=campaign.id));
 end if;
 if exists(select 1 from private.push_campaigns where created_by=uid and created_at>now()-interval '30 seconds') then raise exception 'Espera 30 segundos antes de otro envio';end if;
 insert into private.push_campaigns(id,created_by,title,body,audience)
 values(request_id,uid,trim(payload->>'title'),trim(payload->>'body'),target);
 insert into private.push_jobs(device_id,recipient_id,campaign_id,kind,title,body,tag,expires_at)
 select d.id,d.user_id,request_id,'promotion',trim(payload->>'title'),trim(payload->>'body'),'promotion-'||request_id,now()+interval '24 hours'
 from private.push_devices d join public.profiles p on p.id=d.user_id
 where d.promotions and (target='all' or p.role=target);
 get diagnostics total=row_count;
 if total=0 then raise exception 'No hay dispositivos suscritos a promociones para este publico';end if;
 perform private.wake_push();
 return jsonb_build_object('id',request_id,'queued',total);
end;$$;
revoke all on function private.push_manage(text,jsonb) from public,anon;
grant execute on function private.push_manage(text,jsonb) to authenticated;
create function public.push_manage(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.push_manage(action,payload)$$;
revoke all on function public.push_manage(text,jsonb) from public,anon;
grant execute on function public.push_manage(text,jsonb) to authenticated;

create function private.queue_trip_push() returns trigger language plpgsql security definer set search_path='' as $$
declare title text; message text;
begin
 if tg_op='UPDATE' and old.status=new.status then return new;end if;
 if new.status not in ('searching','assigned','arrived','cancelled') then return new;end if;
 title:=case new.status when 'searching' then 'Nuevo viaje disponible' when 'assigned' then 'Tu motorizado aceptó el viaje' when 'arrived' then 'Tu motorizado llegó' else 'Viaje cancelado' end;
 message:=case new.status when 'searching' then 'Abre De1na para ver la solicitud.' when 'assigned' then 'Abre De1na para consultar tu viaje.' when 'arrived' then 'Prepárate para salir. Revisa tu viaje en De1na.' else 'Abre De1na para consultar el estado del viaje.' end;
 insert into private.push_jobs(device_id,recipient_id,trip_id,trip_status,kind,title,body,tag,expires_at)
 select d.id,d.user_id,new.id,new.status,'trip',title,message,'trip-'||new.id,
   now()+case when new.status='searching' then interval '90 seconds' else interval '10 minutes' end
 from private.push_devices d join public.profiles p on p.id=d.user_id
 where (new.status='searching' and p.role='driver' and p.approved and p.available and not exists(select 1 from public.trips t where t.driver_id=p.id and t.status in ('assigned','arrived','ongoing')))
    or (new.status in ('assigned','arrived') and d.user_id=new.passenger_id)
    or (new.status='cancelled' and d.user_id in (new.passenger_id,new.driver_id) and d.user_id is distinct from auth.uid());
 perform private.wake_push();
 return new;
end;$$;
revoke all on function private.queue_trip_push() from public,anon,authenticated;
create trigger trip_push after insert or update of status on public.trips for each row execute function private.queue_trip_push();

create function private.push_worker(worker_key text,action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; job private.push_jobs; code integer;
begin
 if worker_key is null or length(worker_key)<>64 or worker_key is distinct from (select c.worker_key from private.push_config c where id=1) then raise exception 'No autorizado';end if;
 if action='claim' then
   if not (select enabled from private.push_config where id=1) then return '[]'::jsonb;end if;
   update private.push_jobs j set status='skipped' where status in ('pending','processing') and
     (expires_at<=now() or device_id is null or not exists(select 1 from private.push_devices d where d.id=j.device_id and d.user_id=j.recipient_id and (j.kind<>'promotion' or d.promotions))
      or (kind='trip' and not exists(select 1 from public.trips t where t.id=j.trip_id and t.status=j.trip_status))
      or (kind='trip' and trip_status='searching' and not exists(select 1 from public.profiles p where p.id=j.recipient_id and p.role='driver' and p.approved and p.available and not exists(select 1 from public.trips t where t.driver_id=p.id and t.status in ('assigned','arrived','ongoing')))));
   update private.push_jobs set status='failed' where status in ('pending','processing') and attempts>=3 and coalesce(locked_until,now())<=now();
   with due as (
     select id from private.push_jobs where status in ('pending','processing') and available_at<=now() and coalesce(locked_until,now())<=now() and attempts<3
     order by case when kind='promotion' then 1 else 0 end,created_at limit 20 for update skip locked
   ), claimed as (
     update private.push_jobs j set status='processing',attempts=attempts+1,lease=gen_random_uuid(),locked_until=now()+interval '2 minutes'
     from due where j.id=due.id returning j.*
   ) select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease',j.lease,'kind',j.kind,'title',j.title,'body',j.body,'tag',j.tag,'expires_at',j.expires_at,'endpoint',d.endpoint,'keys',jsonb_build_object('p256dh',d.p256dh,'auth',d.auth))),'[]'::jsonb)
   into result from claimed j join private.push_devices d on d.id=j.device_id;
   return result;
 elsif action='finish' then
   select * into job from private.push_jobs where id=(payload->>'id')::uuid and lease=(payload->>'lease')::uuid and status='processing' for update;
   if job.id is null then return '{}'::jsonb;end if;
   code:=(payload->>'code')::integer;
   update private.push_jobs set status=case when code between 200 and 299 then 'sent' when (code is null or code=429 or code>=500) and attempts<3 then 'pending' else 'failed' end,
     last_code=code,locked_until=null,available_at=now()+interval '1 minute' where id=job.id;
   if code in (404,410) then delete from private.push_devices where id=job.device_id;end if;
   return '{}'::jsonb;
 end if;
 raise exception 'Accion invalida';
end;$$;
revoke all on function private.push_worker(text,text,jsonb) from public;
grant execute on function private.push_worker(text,text,jsonb) to anon,authenticated;
create function public.push_worker(worker_key text,action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.push_worker(worker_key,action,payload)$$;
revoke all on function public.push_worker(text,text,jsonb) from public;
grant execute on function public.push_worker(text,text,jsonb) to anon,authenticated;

select cron.schedule('de1na-push-retry','* * * * *','select private.wake_push()');
select cron.schedule('de1na-push-cleanup','15 4 * * *',$$delete from private.push_jobs where created_at<now()-interval '30 days'; delete from private.push_campaigns where created_at<now()-interval '30 days'; delete from cron.job_run_details where jobid in(select jobid from cron.job where jobname in('de1na-push-retry','de1na-push-cleanup')) and end_time<now()-interval '7 days';$$);
