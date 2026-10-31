-- Ubicación en segundo plano desde la app Android (TWA): el servicio nativo no tiene la sesión del
-- navegador, así que usa un token de seguimiento ligado a un único viaje y a su conductor.
-- El token solo permite escribir la posición de ese viaje mientras esté activo; se borra al terminar.

-- Lógica común de share_location, con el conductor como parámetro.
create function private.share_location_core(
 uid uuid, trip_id uuid, latitude double precision, longitude double precision, accuracy real,
 heading real default null, speed real default null, recorded_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 t public.trips;
 previous public.trip_locations;
 stamp timestamptz := coalesce(share_location_core.recorded_at, clock_timestamp());
begin
 if uid is null or not exists (select 1 from public.profiles where id = uid and role = 'driver' and approved and not suspended) then
  raise exception 'No autorizado';
 end if;
 select * into t from public.trips where id = share_location_core.trip_id and driver_id = uid and status in ('assigned', 'arrived', 'ongoing');
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
revoke all on function private.share_location_core(uuid, uuid, double precision, double precision, real, real, real, timestamptz) from public, anon, authenticated;

create or replace function private.share_location(
 trip_id uuid, latitude double precision, longitude double precision, accuracy real,
 heading real default null, speed real default null, recorded_at timestamptz default null
) returns jsonb language sql security definer set search_path = '' as $$
 select private.share_location_core(auth.uid(), trip_id, latitude, longitude, accuracy, heading, speed, recorded_at)
$$;

create table private.tracking_tokens (
 token_hash text primary key,
 trip_id uuid not null references public.trips(id) on delete cascade,
 driver_id uuid not null references public.profiles(id) on delete cascade,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index tracking_tokens_trip on private.tracking_tokens(trip_id);
alter table private.tracking_tokens enable row level security;
revoke all on private.tracking_tokens from public, anon, authenticated;

-- El conductor del viaje activo obtiene un token nuevo (los anteriores de ese viaje dejan de valer).
create function private.issue_tracking_token(trip_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); token text;
begin
 if uid is null or not exists (select 1 from public.profiles where id = uid and role = 'driver' and approved and not suspended) then
  raise exception 'No autorizado';
 end if;
 if not exists (select 1 from public.trips t where t.id = issue_tracking_token.trip_id and t.driver_id = uid and t.status in ('assigned', 'arrived', 'ongoing')) then
  raise exception 'Este viaje ya no comparte ubicación';
 end if;
 token := encode(extensions.gen_random_bytes(32), 'hex');
 delete from private.tracking_tokens where tracking_tokens.trip_id = issue_tracking_token.trip_id;
 insert into private.tracking_tokens (token_hash, trip_id, driver_id, expires_at)
 values (encode(extensions.digest(token, 'sha256'), 'hex'), issue_tracking_token.trip_id, uid, now() + interval '8 hours');
 return token;
end $$;
revoke all on function private.issue_tracking_token(uuid) from public, anon;
grant execute on function private.issue_tracking_token(uuid) to authenticated;
create function public.issue_tracking_token(trip_id uuid) returns text
language sql security invoker set search_path = '' as $$ select private.issue_tracking_token(trip_id) $$;
revoke all on function public.issue_tracking_token(uuid) from public, anon;
grant execute on function public.issue_tracking_token(uuid) to authenticated;

-- El servicio nativo envía la posición con el token (sin sesión de usuario).
create function private.share_location_token(
 token text, latitude double precision, longitude double precision, accuracy real,
 heading real default null, speed real default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare tk private.tracking_tokens;
begin
 if token is null or token !~ '^[0-9a-f]{64}$' then raise exception 'Token inválido'; end if;
 select * into tk from private.tracking_tokens where token_hash = encode(extensions.digest(token, 'sha256'), 'hex');
 if tk.token_hash is null or tk.expires_at <= now() then raise exception 'Este viaje ya no comparte ubicación'; end if;
 return private.share_location_core(tk.driver_id, tk.trip_id, latitude, longitude, accuracy, heading, speed, null);
end $$;
revoke all on function private.share_location_token(text, double precision, double precision, real, real, real) from public;
grant execute on function private.share_location_token(text, double precision, double precision, real, real, real) to anon, authenticated;
create function public.share_location_token(
 token text, latitude double precision, longitude double precision, accuracy real,
 heading real default null, speed real default null
) returns jsonb language sql security invoker set search_path = '' as $$
 select private.share_location_token(token, latitude, longitude, accuracy, heading, speed)
$$;
revoke all on function public.share_location_token(text, double precision, double precision, real, real, real) from public;
grant execute on function public.share_location_token(text, double precision, double precision, real, real, real) to anon, authenticated;

-- Al terminar, cancelar o reasignar el viaje se borran la posición y los tokens.
create or replace function private.close_trip_location() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status not in ('assigned', 'arrived', 'ongoing') or new.driver_id is distinct from old.driver_id then
  delete from public.trip_locations where trip_id = new.id;
  delete from private.tracking_tokens where trip_id = new.id;
 end if;
 return new;
end $$;
