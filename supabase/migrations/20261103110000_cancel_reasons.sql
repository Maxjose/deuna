-- Cancelaciones: motivo obligatorio, las hechas después de «Llegué» cuentan doble, límite también para pasajeros
-- (por defecto 3 cada 3 horas) y resumen de cancelaciones para la ficha de administración.
alter table public.trips add column cancel_reason text check (length(cancel_reason) <= 200);
alter table public.service_settings add column passenger_cancel_limit integer not null default 3 check (passenger_cancel_limit between 1 and 20),
 add column passenger_cancel_hours integer not null default 3 check (passenger_cancel_hours between 1 and 72);

-- Estado del límite (conductor o pasajero). Peso 2 si se canceló con el conductor en el punto de recogida o en curso.
create function private.cancel_state(person uuid, who text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.service_settings; lim integer; hrs integer; used integer; until timestamptz;
begin
 select * into strict s from public.service_settings where id = 1;
 lim := case when who = 'driver' then s.driver_cancel_limit else s.passenger_cancel_limit end;
 hrs := case when who = 'driver' then s.driver_cancel_hours else s.passenger_cancel_hours end;
 with recent as (
  select cancelled_at, case when cancelled_stage in ('arrived', 'ongoing') then 2 else 1 end as weight
  from public.trips
  where cancelled_by = who and cancelled_at > now() - make_interval(hours => hrs)
   and ((who = 'driver' and driver_id = person) or (who = 'passenger' and passenger_id = person and cancelled_stage is distinct from 'searching'))
 ), running as (select cancelled_at, sum(weight) over (order by cancelled_at desc rows unbounded preceding) as total from recent)
 select coalesce((select sum(weight) from recent), 0), (select min(cancelled_at) from running where total >= lim) + make_interval(hours => hrs)
 into used, until;
 return jsonb_build_object('limit', lim, 'hours', hrs, 'used', least(used, lim), 'blocked_until', until);
end $$;
revoke all on function private.cancel_state(uuid, text) from public, anon, authenticated;
create or replace function private.driver_cancel_state(driver uuid) returns jsonb language sql stable security definer set search_path = '' as $$ select private.cancel_state(driver, 'driver') $$;
create or replace function private.my_cancel_state() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r text;
begin
 if auth.uid() is null then raise exception 'No autorizado'; end if;
 select role into r from public.profiles where id = auth.uid();
 return private.cancel_state(auth.uid(), case when r = 'driver' then 'driver' else 'passenger' end);
end $$;

-- Conductor: la solicitud de cancelación exige motivo.
do $$declare definition text; patched text;begin
 select pg_get_functiondef('private.driver_cancel(text,jsonb)'::regprocedure) into definition;
 patched := replace(definition,
  'update public.trips set cancel_requested=true,cancel_requested_at=now() where id=t.id;',
  'if length(btrim(coalesce(payload->>''reason'', ''''))) < 3 then raise exception ''Motivo requerido'';end if;' || chr(10) ||
  '  update public.trips set cancel_requested=true,cancel_requested_at=now(),cancel_reason=left(btrim(payload->>''reason''),200) where id=t.id;');
 if patched = definition then raise exception 'Missing driver_cancel update'; end if;
 patched := replace(patched, 'Tu conductor solicita cancelar el viaje. Abre Inicio para aprobar o rechazar.''',
  'Tu conductor solicita cancelar el viaje: '' || left(btrim(payload->>''reason''), 80) || ''. Abre Inicio para aprobar o rechazar.''');
 execute patched;
end $$;

-- Pasajero: con conductor asignado, exige motivo y respeta su límite. Cancelar mientras se busca conductor no cuenta.
do $$declare definition text; patched text; marker text := 'if t.passenger_id<>uid or t.status not in (''searching'',''assigned'',''arrived'') then raise exception ''Cancelación inválida'';end if;';begin
 select pg_get_functiondef('private.operate(text,jsonb)'::regprocedure) into definition;
 if position(marker in definition) = 0 then raise exception 'Missing passenger cancel point'; end if;
 patched := replace(definition, marker || chr(10) || '   update public.trips set status=''cancelled'' where id=t.id;',
  marker || chr(10) ||
  '   if t.status <> ''searching'' then' || chr(10) ||
  '    if length(btrim(coalesce(payload->>''reason'', ''''))) < 3 then raise exception ''Motivo requerido'';end if;' || chr(10) ||
  '    if (private.cancel_state(uid, ''passenger'')->>''blocked_until'') is not null then raise exception ''Límite de cancelaciones'';end if;' || chr(10) ||
  '   end if;' || chr(10) ||
  '   update public.trips set status=''cancelled'',cancel_reason=case when t.status <> ''searching'' then left(btrim(payload->>''reason''),200) end where id=t.id;');
 if patched = definition then raise exception 'Missing passenger cancel update'; end if;
 execute patched;
end $$;

-- Administración: resumen de cancelaciones de una persona (7 días y últimas con motivo).
create function private.admin_cancellations(person_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 return jsonb_build_object(
  'as_driver_7d', (select count(*) from public.trips where driver_id = person_id and cancelled_by = 'driver' and cancelled_at > now() - interval '7 days'),
  'as_passenger_7d', (select count(*) from public.trips where passenger_id = person_id and cancelled_by = 'passenger' and cancelled_stage is distinct from 'searching' and cancelled_at > now() - interval '7 days'),
  'after_arrival_7d', (select count(*) from public.trips where (driver_id = person_id and cancelled_by = 'driver' or passenger_id = person_id and cancelled_by = 'passenger') and cancelled_stage in ('arrived', 'ongoing') and cancelled_at > now() - interval '7 days'),
  'recent', coalesce((select jsonb_agg(x order by x.cancelled_at desc) from (
    select id, cancelled_at, cancelled_by, cancelled_stage, cancel_reason, destination from public.trips
    where ((driver_id = person_id and cancelled_by = 'driver') or (passenger_id = person_id and cancelled_by = 'passenger' and cancelled_stage is distinct from 'searching'))
    order by cancelled_at desc nulls last limit 10) x), '[]'::jsonb),
  'state', private.cancel_state(person_id, case when (select role from public.profiles where id = person_id) = 'driver' then 'driver' else 'passenger' end));
end $$;
revoke all on function private.admin_cancellations(uuid) from public, anon;
grant execute on function private.admin_cancellations(uuid) to authenticated;
create function public.admin_cancellations(person_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_cancellations(person_id) $$;
revoke all on function public.admin_cancellations(uuid) from public, anon;
grant execute on function public.admin_cancellations(uuid) to authenticated;

-- Administración: límites de conductor y pasajero.
drop function public.admin_cancel_limit(integer, integer);
drop function private.admin_cancel_limit(integer, integer);
create function private.admin_cancel_limit(payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare dl integer := (payload->>'driver_limit')::integer; dh integer := (payload->>'driver_hours')::integer;
 pl integer := (payload->>'passenger_limit')::integer; ph integer := (payload->>'passenger_hours')::integer;
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 if dl not between 1 and 20 or dh not between 1 and 72 or pl not between 1 and 20 or ph not between 1 and 72 then raise exception 'Valores inválidos'; end if;
 update public.service_settings set driver_cancel_limit = dl, driver_cancel_hours = dh, passenger_cancel_limit = pl, passenger_cancel_hours = ph where id = 1;
end $$;
revoke all on function private.admin_cancel_limit(jsonb) from public, anon;
grant execute on function private.admin_cancel_limit(jsonb) to authenticated;
create function public.admin_cancel_limit(payload jsonb) returns void language sql security invoker set search_path = '' as $$ select private.admin_cancel_limit(payload) $$;
revoke all on function public.admin_cancel_limit(jsonb) from public, anon;
grant execute on function public.admin_cancel_limit(jsonb) to authenticated;
