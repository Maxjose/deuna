-- Carros: segundo tipo de servicio con tarifas, planes y conductores propios. Moto y carro se activan por separado.
alter table public.profiles add column vehicle_type text not null default 'moto' check (vehicle_type in ('moto', 'car'));
alter table public.trips add column vehicle_type text not null default 'moto' check (vehicle_type in ('moto', 'car'));
alter table private.driver_vehicles add column vehicle_type text not null default 'moto' check (vehicle_type in ('moto', 'car')),
 add column year integer check (year between 1970 and 2100);
alter table public.service_settings
 add column moto_enabled boolean not null default true,
 add column car_enabled boolean not null default false,
 add column car_base_cents integer not null default 100 check (car_base_cents between 0 and 1000000),
 add column car_per_km_cents integer check (car_per_km_cents between 1 and 1000000),
 add column car_minimum_cents integer not null default 200 check (car_minimum_cents between 0 and 1000000),
 add column car_rounding_cents integer not null default 50 check (car_rounding_cents in (1, 50, 100)),
 add column car_night_enabled boolean not null default false,
 add column car_night_start time not null default '20:00',
 add column car_night_end time not null default '05:00',
 add column car_night_percent integer not null default 0 check (car_night_percent between 0 and 300),
 add column sub_car_week_cents integer not null default 1000 check (sub_car_week_cents between 100 and 100000),
 add column sub_car_month_cents integer not null default 3500 check (sub_car_month_cents between 100 and 100000);

create function private.my_vehicle_type() returns text language sql stable security definer set search_path = '' as $$
 select vehicle_type from public.profiles where id = auth.uid()
$$;
revoke all on function private.my_vehicle_type() from public, anon;
grant execute on function private.my_vehicle_type() to authenticated;

-- Precio del plan según el tipo de vehículo del conductor.
create function private.plan_price(driver uuid, plan text) returns integer language sql stable security definer set search_path = '' as $$
 select case when coalesce((select vehicle_type from public.profiles where id = driver), 'moto') = 'car'
   then case when plan = 'week' then s.sub_car_week_cents else s.sub_car_month_cents end
   else case when plan = 'week' then s.sub_week_cents else s.sub_month_cents end end
 from public.service_settings s where s.id = 1
$$;
revoke all on function private.plan_price(uuid, text) from public, anon, authenticated;

do $$declare definition text; patched text;begin
 select pg_get_functiondef('private.plan_state(uuid)'::regprocedure) into definition;
 patched := replace(definition, '''week_cents'', s.sub_week_cents, ''month_cents'', s.sub_month_cents',
  '''week_cents'', private.plan_price(driver, ''week''), ''month_cents'', private.plan_price(driver, ''month''), ''vehicle_type'', (select vehicle_type from public.profiles where id = driver)');
 if patched = definition then raise exception 'Missing plan_state prices'; end if;
 execute patched;
 select pg_get_functiondef('private.request_plan_payment(text,text,text,text)'::regprocedure) into definition;
 patched := replace(definition, 'cents := case when plan = ''week'' then s.sub_week_cents else s.sub_month_cents end;', 'cents := private.plan_price(uid, plan);');
 if patched = definition then raise exception 'Missing request_plan_payment price'; end if;
 execute patched;
 select pg_get_functiondef('private.binance_confirm(text,jsonb)'::regprocedure) into definition;
 patched := replace(definition, 'cents := case when payload->>''plan'' = ''week'' then s.sub_week_cents else s.sub_month_cents end;', 'cents := private.plan_price(uid, payload->>''plan'');');
 if patched = definition then raise exception 'Missing binance plan price'; end if;
 execute patched;
end $$;

-- Solicitud: el tipo viaja firmado en la cotización y debe estar activo. Además, la configuración se lee
-- antes de validar el método (antes se usaba sin cargar y algunas validaciones no se aplicaban).
do $$declare definition text; patched text;begin
 select pg_get_functiondef('private.insert_quoted_trip(jsonb)'::regprocedure) into definition;
 patched := replace(definition, '  select * into strict s from public.service_settings where id=1;' || chr(10), '');
 patched := replace(patched, '  if exists (select 1 from private.debt_trips(auth.uid())) then raise exception ''Saldo pendiente''; end if;',
  '  select * into strict s from public.service_settings where id=1;' || chr(10) ||
  '  if coalesce(q->>''vehicle_type'', ''moto'') not in (''moto'', ''car'') then raise exception ''Cotizacion invalida''; end if;' || chr(10) ||
  '  if (coalesce(q->>''vehicle_type'', ''moto'') = ''moto'' and not s.moto_enabled) or (q->>''vehicle_type'' = ''car'' and not s.car_enabled) then raise exception ''Vehiculo no disponible''; end if;' || chr(10) ||
  '  if exists (select 1 from private.debt_trips(auth.uid())) then raise exception ''Saldo pendiente''; end if;');
 if position('Vehiculo no disponible' in patched) = 0 or position('select * into strict s' in patched) > position('Viaje de prueba no disponible' in patched) then raise exception 'Missing insert patch'; end if;
 patched := replace(patched, 'insert into public.trips(passenger_id,origin,destination,zone,fare_cents,currency,distance_meters,duration_seconds,quote_id,payment_method,exchange_rate)',
  'insert into public.trips(passenger_id,origin,destination,zone,fare_cents,currency,distance_meters,duration_seconds,quote_id,payment_method,exchange_rate,vehicle_type)');
 patched := replace(patched, 'method, case when method = ''pago_movil'' then s.exchange_rate end);',
  'method, case when method = ''pago_movil'' then s.exchange_rate end, coalesce(q->>''vehicle_type'', ''moto''));');
 if position('coalesce(q->>''vehicle_type'', ''moto''));' in patched) = 0 then raise exception 'Missing insert values'; end if;
 execute patched;
end $$;

-- Emparejamiento: cada conductor solo ve, acepta y recibe avisos de viajes de su tipo de vehículo.
drop policy trips_read on public.trips;
create policy trips_read on public.trips for select to authenticated using (
 passenger_id = (select auth.uid()) or driver_id = (select auth.uid()) or (select private.my_role()) = 'admin'
 or (status = 'searching' and (select private.can_receive()) and vehicle_type = (select private.my_vehicle_type())));
do $$declare definition text; patched text;begin
 select pg_get_functiondef('private.operate(text,jsonb)'::regprocedure) into definition;
 patched := replace(definition, 'if p.role<>''driver'' or not p.approved or not p.available or t.status<>''searching'' then raise exception ''No disponible'';end if;',
  'if p.role<>''driver'' or not p.approved or not p.available or t.status<>''searching'' or t.vehicle_type is distinct from p.vehicle_type then raise exception ''No disponible'';end if;');
 if patched = definition then raise exception 'Missing accept check'; end if;
 execute patched;
 select pg_get_functiondef('private.queue_trip_push()'::regprocedure) into definition;
 patched := replace(definition, 'new.status=''searching'' and p.role=''driver'' and p.approved and p.available', 'new.status=''searching'' and p.role=''driver'' and p.approved and p.available and p.vehicle_type=new.vehicle_type');
 if patched = definition then raise exception 'Missing push filter'; end if;
 execute patched;
 select pg_get_functiondef('private.trip_person(uuid)'::regprocedure) into definition;
 patched := replace(definition, 'jsonb_build_object(''plate'',plate,''model'',model,''color'',color) from private.driver_vehicles',
  'jsonb_build_object(''plate'',plate,''model'',model,''color'',color,''year'',year,''type'',vehicle_type) from private.driver_vehicles');
 if patched = definition then raise exception 'Missing trip_person vehicle'; end if;
 execute patched;
end $$;

-- Aprobar exige el vehículo del mismo tipo que el perfil.
create or replace function private.require_driver_data() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if old.role = 'driver' and new.role = 'driver' and not old.approved and new.approved
    and (not exists (select 1 from private.driver_vehicles v where v.driver_id = new.id and v.vehicle_type = new.vehicle_type)
         or not exists (select 1 from private.driver_payout where driver_id = new.id)) then
  raise exception 'Faltan datos del conductor';
 end if;
 return new;
end $$;

-- Conductor: datos del vehículo. Elige moto o carro mientras no esté aprobado; luego solo la administración lo cambia.
create or replace function private.my_driver_data() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'No autorizado'; end if;
 return jsonb_build_object(
  'vehicle_type', (select vehicle_type from public.profiles where id = auth.uid()),
  'locked', (select approved from public.profiles where id = auth.uid()),
  'vehicle', (select jsonb_build_object('plate', plate, 'model', model, 'color', color, 'year', year, 'type', vehicle_type) from private.driver_vehicles where driver_id = auth.uid()),
  'payout', (select jsonb_build_object('bank', bank, 'id_number', id_number, 'phone', phone) from private.driver_payout where driver_id = auth.uid()));
end $$;
drop function public.save_my_vehicle(text, text, text);
drop function private.save_my_vehicle(text, text, text);
create function private.save_my_vehicle(plate text, model text, color text, kind text default null, year integer default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); p text := upper(regexp_replace(coalesce(plate, ''), '[^A-Za-z0-9]', '', 'g')); prof public.profiles; k text;
begin
 select * into prof from public.profiles where id = uid;
 if uid is null or prof.role is distinct from 'driver' then raise exception 'No autorizado'; end if;
 k := coalesce(kind, prof.vehicle_type);
 if k not in ('moto', 'car') then raise exception 'Tipo inválido'; end if;
 if k <> prof.vehicle_type and prof.approved then raise exception 'Tipo bloqueado'; end if;
 if p !~ '^[A-Z0-9]{5,8}$' then raise exception 'Placa inválida'; end if;
 if length(btrim(coalesce(model, ''))) < 2 or length(btrim(coalesce(color, ''))) < 3 then raise exception 'Completa modelo y color'; end if;
 if k = 'car' and (year is null or year < 1970 or year > extract(year from now())::integer + 1) then raise exception 'Año inválido'; end if;
 if exists (select 1 from private.driver_vehicles v where v.plate = p and v.driver_id <> uid) then raise exception 'Placa ya registrada'; end if;
 if k <> prof.vehicle_type then update public.profiles set vehicle_type = k where id = uid; end if;
 insert into private.driver_vehicles(driver_id, plate, model, color, vehicle_type, year) values(uid, p, left(btrim(model), 60), left(btrim(color), 30), k, case when k = 'car' then year end)
 on conflict (driver_id) do update set plate = excluded.plate, model = excluded.model, color = excluded.color, vehicle_type = excluded.vehicle_type, year = excluded.year, updated_at = now();
 return private.my_driver_data();
end $$;
create function public.save_my_vehicle(plate text, model text, color text, kind text default null, year integer default null) returns jsonb language sql security invoker set search_path = '' as $$ select private.save_my_vehicle(plate, model, color, kind, year) $$;

-- Administración: tipo del conductor, interruptores y tarifas de carro.
create function private.admin_set_vehicle_type(driver_id uuid, kind text) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 if kind not in ('moto', 'car') then raise exception 'Tipo inválido'; end if;
 if exists (select 1 from public.trips t where t.driver_id = admin_set_vehicle_type.driver_id and t.status in ('assigned', 'arrived', 'ongoing')) then raise exception 'Esta cuenta tiene un viaje activo'; end if;
 update public.profiles p set vehicle_type = kind, available = case when p.vehicle_type <> kind then false else p.available end where p.id = admin_set_vehicle_type.driver_id and p.role = 'driver';
end $$;
create function private.admin_vehicle_settings(payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 if payload ? 'moto_enabled' or payload ? 'car_enabled' then
  if not coalesce((payload->>'moto_enabled')::boolean, true) and not coalesce((payload->>'car_enabled')::boolean, false) then raise exception 'Activa al menos un servicio'; end if;
  update public.service_settings set moto_enabled = coalesce((payload->>'moto_enabled')::boolean, moto_enabled), car_enabled = coalesce((payload->>'car_enabled')::boolean, car_enabled) where id = 1;
 end if;
 if payload ? 'car_per_km_cents' then
  update public.service_settings set car_base_cents = (payload->>'car_base_cents')::integer, car_per_km_cents = (payload->>'car_per_km_cents')::integer,
   car_minimum_cents = (payload->>'car_minimum_cents')::integer, car_rounding_cents = coalesce((payload->>'car_rounding_cents')::integer, car_rounding_cents) where id = 1;
 end if;
 if payload ? 'car_night_enabled' then
  update public.service_settings set car_night_enabled = (payload->>'car_night_enabled')::boolean, car_night_start = (payload->>'car_night_start')::time,
   car_night_end = (payload->>'car_night_end')::time, car_night_percent = (payload->>'car_night_percent')::integer where id = 1;
 end if;
 if payload ? 'sub_car_week_cents' then
  update public.service_settings set sub_car_week_cents = (payload->>'sub_car_week_cents')::integer, sub_car_month_cents = (payload->>'sub_car_month_cents')::integer where id = 1;
 end if;
end $$;
do $$declare f text;begin
 foreach f in array array['admin_set_vehicle_type(uuid,text)', 'admin_vehicle_settings(jsonb)', 'save_my_vehicle(text,text,text,text,integer)'] loop
  execute format('revoke all on function private.%s from public, anon', f);
  execute format('grant execute on function private.%s to authenticated', f);
 end loop;
end $$;
create function public.admin_set_vehicle_type(driver_id uuid, kind text) returns void language sql security invoker set search_path = '' as $$ select private.admin_set_vehicle_type(driver_id, kind) $$;
create function public.admin_vehicle_settings(payload jsonb) returns void language sql security invoker set search_path = '' as $$ select private.admin_vehicle_settings(payload) $$;
do $$declare f text;begin
 foreach f in array array['admin_set_vehicle_type(uuid,text)', 'admin_vehicle_settings(jsonb)', 'save_my_vehicle(text,text,text,text,integer)'] loop
  execute format('revoke all on function public.%s from public, anon', f);
  execute format('grant execute on function public.%s to authenticated', f);
 end loop;
end $$;

-- Ficha de administración: incluye tipo y año.
do $$declare definition text; patched text;begin
 select pg_get_functiondef('private.admin_driver_profile(uuid)'::regprocedure) into definition;
 patched := replace(definition, '''vehicle'', (select jsonb_build_object(''plate'', plate, ''model'', model, ''color'', color) from private.driver_vehicles v',
  '''vehicle_type'', (select vehicle_type from public.profiles where id = admin_driver_profile.driver_id),' || chr(10) ||
  '  ''vehicle'', (select jsonb_build_object(''plate'', plate, ''model'', model, ''color'', color, ''year'', year, ''type'', vehicle_type) from private.driver_vehicles v');
 if patched = definition then raise exception 'Missing admin profile vehicle'; end if;
 execute patched;
end $$;

-- Listados de administración: tipo de vehículo de cada persona.
do $$declare definition text; patched text;begin
 select pg_get_functiondef('private.admin_records(text,text,integer)'::regprocedure) into definition;
 patched := replace(definition, 'select p.id,p.role,p.approved,p.available,p.suspended,', 'select p.id,p.role,p.approved,p.available,p.suspended,p.vehicle_type,');
 if patched = definition then raise exception 'Missing admin_records columns'; end if;
 execute patched;
end $$;
