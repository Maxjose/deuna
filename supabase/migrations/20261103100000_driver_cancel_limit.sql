-- Límite de cancelaciones del conductor: tras N cancelaciones en X horas, no puede pedir otra hasta que pase el plazo.
-- También se registra quién canceló, cuándo y en qué etapa (para detectar abusos).
alter table public.trips add column cancelled_by text check (cancelled_by in ('driver', 'passenger', 'system')),
 add column cancelled_at timestamptz, add column cancelled_stage text;
alter table public.service_settings add column driver_cancel_limit integer not null default 2 check (driver_cancel_limit between 1 and 20),
 add column driver_cancel_hours integer not null default 4 check (driver_cancel_hours between 1 and 72);

create function private.mark_cancellation() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
  new.cancelled_at := coalesce(new.cancelled_at, now());
  new.cancelled_stage := coalesce(new.cancelled_stage, old.status);
  new.cancelled_by := coalesce(new.cancelled_by, case
   when old.cancel_requested then 'driver'
   when auth.uid() is not null and auth.uid() = new.driver_id then 'driver'
   when auth.uid() is not null and auth.uid() = new.passenger_id then 'passenger'
   else 'system' end);
 end if;
 return new;
end $$;
revoke all on function private.mark_cancellation() from public, anon, authenticated;
create trigger mark_cancellation before update of status on public.trips for each row execute function private.mark_cancellation();

-- Estado del límite para un conductor: cancelaciones en la ventana y hasta cuándo está bloqueado.
create function private.driver_cancel_state(driver uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.service_settings; used integer; oldest timestamptz;
begin
 select * into strict s from public.service_settings where id = 1;
 select count(*), min(cancelled_at) into used, oldest from (
  select cancelled_at from public.trips where driver_id = driver and cancelled_by = 'driver' and cancelled_at > now() - make_interval(hours => s.driver_cancel_hours)
  order by cancelled_at desc limit s.driver_cancel_limit) x;
 return jsonb_build_object('limit', s.driver_cancel_limit, 'hours', s.driver_cancel_hours, 'used', used,
  'blocked_until', case when used >= s.driver_cancel_limit then oldest + make_interval(hours => s.driver_cancel_hours) end);
end $$;
revoke all on function private.driver_cancel_state(uuid) from public, anon, authenticated;

create function private.my_cancel_state() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'No autorizado'; end if;
 return private.driver_cancel_state(auth.uid());
end $$;
revoke all on function private.my_cancel_state() from public, anon;
grant execute on function private.my_cancel_state() to authenticated;
create function public.my_cancel_state() returns jsonb language sql security invoker set search_path = '' as $$ select private.my_cancel_state() $$;
revoke all on function public.my_cancel_state() from public, anon;
grant execute on function public.my_cancel_state() to authenticated;

-- Bloquear la solicitud de cancelación al alcanzar el límite.
do $$declare definition text; patched text;begin
 select pg_get_functiondef('private.driver_cancel(text,jsonb)'::regprocedure) into definition;
 patched := replace(definition,
  'if t.cancel_requested then return;end if;',
  'if t.cancel_requested then return;end if;' || chr(10) ||
  '  if (private.driver_cancel_state(uid)->>''blocked_until'') is not null then raise exception ''Límite de cancelaciones'';end if;');
 if patched = definition then raise exception 'Missing driver_cancel insertion point'; end if;
 execute patched;
end $$;

-- Administración: configurar el límite.
create function private.admin_cancel_limit(cancel_limit integer, cancel_hours integer) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 if cancel_limit is null or cancel_limit < 1 or cancel_limit > 20 or cancel_hours is null or cancel_hours < 1 or cancel_hours > 72 then raise exception 'Valores inválidos'; end if;
 update public.service_settings set driver_cancel_limit = cancel_limit, driver_cancel_hours = cancel_hours where id = 1;
end $$;
revoke all on function private.admin_cancel_limit(integer, integer) from public, anon;
grant execute on function private.admin_cancel_limit(integer, integer) to authenticated;
create function public.admin_cancel_limit(cancel_limit integer, cancel_hours integer) returns void language sql security invoker set search_path = '' as $$ select private.admin_cancel_limit(cancel_limit, cancel_hours) $$;
revoke all on function public.admin_cancel_limit(integer, integer) from public, anon;
grant execute on function public.admin_cancel_limit(integer, integer) to authenticated;
