-- Ubicación en vivo del motorizado durante un viaje activo.
-- Una fila por viaje (la última posición). Solo el motorizado asignado escribe, mediante share_location;
-- el pasajero del viaje y la administración la leen. Se borra al terminar, cancelar o reasignar el viaje.
create table public.trip_locations (
 trip_id uuid primary key references public.trips(id) on delete cascade,
 driver_id uuid not null references public.profiles(id) on delete cascade,
 latitude double precision not null check (latitude between -90 and 90),
 longitude double precision not null check (longitude between -180 and 180),
 accuracy real not null check (accuracy between 0 and 1000),
 heading real check (heading >= 0 and heading < 360),
 speed real check (speed >= 0 and speed <= 100),
 recorded_at timestamptz not null,
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.trip_locations enable row level security;
revoke all on public.trip_locations from public, anon, authenticated;
grant select on public.trip_locations to authenticated;
create policy trip_locations_read on public.trip_locations for select to authenticated using (
 driver_id = (select auth.uid())
 or (select private.my_role()) = 'admin'
 or exists (
  select 1 from public.trips t
  where t.id = trip_locations.trip_id
   and t.passenger_id = (select auth.uid())
   and t.driver_id = trip_locations.driver_id
   and t.status in ('assigned', 'arrived', 'ongoing')
 )
);

create function private.share_location(
 trip_id uuid, latitude double precision, longitude double precision, accuracy real,
 heading real default null, speed real default null, recorded_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 uid uuid := auth.uid();
 t public.trips;
 previous public.trip_locations;
 stamp timestamptz := coalesce(share_location.recorded_at, clock_timestamp());
begin
 if uid is null or not exists (select 1 from public.profiles where id = uid and role = 'driver' and approved and not suspended) then
  raise exception 'No autorizado';
 end if;
 select * into t from public.trips where id = share_location.trip_id and driver_id = uid and status in ('assigned', 'arrived', 'ongoing');
 if t.id is null then raise exception 'Este viaje ya no comparte ubicación'; end if;
 if latitude is null or longitude is null or accuracy is null
  or latitude <> latitude or longitude <> longitude or accuracy <> accuracy
  or latitude not between -90 and 90 or longitude not between -180 and 180
  or accuracy not between 0 and 1000
  or (heading is not null and (heading <> heading or heading < 0 or heading >= 360))
  or (speed is not null and (speed <> speed or speed < 0 or speed > 100)) then
  raise exception 'Ubicación inválida';
 end if;
 if stamp > clock_timestamp() + interval '1 minute' or stamp < clock_timestamp() - interval '2 minutes' then
  raise exception 'Ubicación antigua';
 end if;
 select * into previous from public.trip_locations l where l.trip_id = t.id for update;
 -- Ignora posiciones fuera de orden y limita la frecuencia de escritura a una cada 2 segundos.
 if previous.trip_id is not null and (stamp <= previous.recorded_at or previous.updated_at > clock_timestamp() - interval '2 seconds') then
  return jsonb_build_object('saved', false);
 end if;
 insert into public.trip_locations as l (trip_id, driver_id, latitude, longitude, accuracy, heading, speed, recorded_at, updated_at)
 values (t.id, uid, latitude, longitude, accuracy, heading, speed, stamp, clock_timestamp())
 on conflict on constraint trip_locations_pkey do update set
  driver_id = excluded.driver_id, latitude = excluded.latitude, longitude = excluded.longitude,
  accuracy = excluded.accuracy, heading = excluded.heading, speed = excluded.speed,
  recorded_at = excluded.recorded_at, updated_at = excluded.updated_at;
 return jsonb_build_object('saved', true);
end $$;
revoke all on function private.share_location(uuid, double precision, double precision, real, real, real, timestamptz) from public, anon;
grant execute on function private.share_location(uuid, double precision, double precision, real, real, real, timestamptz) to authenticated;
create function public.share_location(
 trip_id uuid, latitude double precision, longitude double precision, accuracy real,
 heading real default null, speed real default null, recorded_at timestamptz default null
) returns jsonb language sql security invoker set search_path = '' as $$
 select private.share_location(trip_id, latitude, longitude, accuracy, heading, speed, recorded_at)
$$;
revoke all on function public.share_location(uuid, double precision, double precision, real, real, real, timestamptz) from public, anon;
grant execute on function public.share_location(uuid, double precision, double precision, real, real, real, timestamptz) to authenticated;

-- Privacidad: la posición deja de existir cuando el viaje termina, se cancela o cambia de motorizado.
create function private.close_trip_location() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status not in ('assigned', 'arrived', 'ongoing') or new.driver_id is distinct from old.driver_id then
  delete from public.trip_locations where trip_id = new.id;
 end if;
 return new;
end $$;
revoke all on function private.close_trip_location() from public, anon, authenticated;
create trigger close_trip_location after update of status, driver_id on public.trips for each row execute function private.close_trip_location();

do $$ begin
 if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
  alter publication supabase_realtime add table public.trip_locations;
 end if;
end $$;
