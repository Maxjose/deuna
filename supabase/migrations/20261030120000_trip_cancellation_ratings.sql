alter table public.trips add column cancel_requested boolean not null default false,add column cancel_requested_at timestamptz;
create function private.driver_cancel(action text,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare t public.trips;uid uuid:=auth.uid();notice_id text;
begin
 select * into strict t from public.trips where id=(payload->>'id')::uuid for update;
 if t.status not in ('assigned','arrived','ongoing') then raise exception 'Viaje no activo';end if;
 if action='request_cancel' then
  if t.driver_id is distinct from uid then raise exception 'No autorizado';end if;
  if t.cancel_requested then return;end if;
  if t.cancel_requested_at>now()-interval '1 minute' then raise exception 'Espera antes de volver a solicitar';end if;
  update public.trips set cancel_requested=true,cancel_requested_at=now() where id=t.id;
  notice_id:='cancel-request:'||t.id||':'||extract(epoch from now());
  insert into public.notification_inbox(user_id,id,title,body) values(t.passenger_id,notice_id,'Solicitud de cancelación','Tu motorizado solicita cancelar el viaje. Abre Inicio para aprobar o rechazar.');
  insert into private.push_jobs(device_id,recipient_id,trip_id,trip_status,kind,title,body,tag,expires_at)
  select id,user_id,t.id,t.status,'trip','Solicitud de cancelación','Tu motorizado solicita cancelar. Abre Inicio para aprobar o rechazar.',notice_id,now()+interval '10 minutes' from private.push_devices where user_id=t.passenger_id;
  perform private.wake_push();
 elsif action='respond_cancel' then
  if t.passenger_id<>uid or not t.cancel_requested or jsonb_typeof(payload->'approved') is distinct from 'boolean' then raise exception 'No autorizado';end if;
  update public.trips set cancel_requested=false,status=case when (payload->>'approved')::boolean then 'cancelled' else status end where id=t.id;
 else raise exception 'Acción inválida';end if;
end $$;
revoke all on function private.driver_cancel(text,jsonb) from public,anon,authenticated;
do $$declare definition text;marker text:='if action=''request'' then';begin
 select pg_get_functiondef('private.operate(text,jsonb)'::regprocedure) into definition;
 if position(marker in definition)=0 then raise exception 'Missing operation insertion point';end if;
 definition:=replace(definition,marker,'if action in (''request_cancel'',''respond_cancel'') then perform private.driver_cancel(action,payload);return;end if;
 if action in (''accept'',''available'') and exists(select 1 from public.trips where driver_id=uid and status in (''assigned'',''arrived'',''ongoing'')) then raise exception ''Completa tu viaje activo primero'';end if;
 '||marker);
 execute definition;
end $$;
create table private.trip_ratings(trip_id uuid primary key references public.trips(id) on delete cascade,passenger_id uuid not null references public.profiles(id),driver_id uuid not null references public.profiles(id),stars integer check(stars between 1 and 5),created_at timestamptz not null default now());
create index trip_ratings_driver on private.trip_ratings(driver_id) where stars is not null;
alter table private.trip_ratings enable row level security;
revoke all on private.trip_ratings from public,anon,authenticated;
-- Existing trips do not open retrospective completion prompts.
insert into private.trip_ratings(trip_id,passenger_id,driver_id) select id,passenger_id,driver_id from public.trips where status='finished';
create function private.trip_feedback(action text,trip_id uuid default null,stars integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();t public.trips;result jsonb;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='passenger' and not suspended) then raise exception 'No autorizado';end if;
 perform pg_advisory_xact_lock(4173001);
 if action='pending' then
  select * into t from public.trips x where passenger_id=uid and status='finished' and not exists(select 1 from private.trip_ratings r where r.trip_id=x.id) order by created_at desc limit 1;
  if t.id is null then return null;end if;
  return jsonb_build_object('id',t.id,'destination',t.destination,'driver_name',(select coalesce(nullif(raw_user_meta_data->>'display_name',''),'Tu motorizado') from auth.users where id=t.driver_id));
 end if;
 select * into strict t from public.trips where id=trip_id and passenger_id=uid and status='finished';
 if action='rate' and (stars is null or stars not between 1 and 5) then raise exception 'Calificación inválida';end if;
 if action not in ('rate','dismiss') then raise exception 'Acción inválida';end if;
 insert into private.trip_ratings(trip_id,passenger_id,driver_id,stars) values(t.id,uid,t.driver_id,case when action='rate' then stars end) on conflict do nothing;
 return jsonb_build_object('saved',true);
end $$;
revoke all on function private.trip_feedback(text,uuid,integer) from public,anon;
grant execute on function private.trip_feedback(text,uuid,integer) to authenticated;
create function public.trip_feedback(action text,trip_id uuid default null,stars integer default null) returns jsonb language sql security invoker set search_path='' as $$select private.trip_feedback(action,trip_id,stars)$$;
revoke all on function public.trip_feedback(text,uuid,integer) from public,anon;
grant execute on function public.trip_feedback(text,uuid,integer) to authenticated;
create function private.driver_reputation(person_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not (person_id=auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and role='admin') or exists(select 1 from public.trips where driver_id=person_id and passenger_id=auth.uid())) then raise exception 'No autorizado';end if;
 return (select jsonb_build_object('average',round(avg(stars),2),'count',count(stars)) from private.trip_ratings where driver_id=person_id);
end $$;
revoke all on function private.driver_reputation(uuid) from public,anon;
grant execute on function private.driver_reputation(uuid) to authenticated;
create function public.driver_reputation(person_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.driver_reputation(person_id)$$;
revoke all on function public.driver_reputation(uuid) from public,anon;
grant execute on function public.driver_reputation(uuid) to authenticated;
