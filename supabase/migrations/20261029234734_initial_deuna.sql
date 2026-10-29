-- Esquema inicial para un proyecto NUEVO de DeUna. Revisar antes de aplicar.
-- No se aplica automáticamente a ninguna cuenta.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'passenger' check(role in ('passenger','driver','admin')),
 approved boolean not null default false,
 available boolean not null default false
);
create table public.service_settings (
 id integer primary key check(id=1), enabled boolean not null default false,
 open_time time not null default '06:00', close_time time not null default '22:00',
 zones text[] not null check(cardinality(zones)>0)
);
insert into public.service_settings(id,zones) values(1,array['San Rafael de El Moján','Santa Cruz de Mara','La Sierrita']);
create table public.trips (
 id uuid primary key default gen_random_uuid(),
 passenger_id uuid not null references public.profiles(id),
 driver_id uuid references public.profiles(id),
 origin text not null check(length(trim(origin)) between 1 and 150),
 destination text not null check(length(trim(destination)) between 1 and 150),
 zone text not null, status text not null default 'searching' check(status in ('searching','assigned','arrived','ongoing','finished','cancelled')),
 created_at timestamptz not null default now(),
 check(lower(trim(origin))<>lower(trim(destination))),
 check((status='searching' and driver_id is null) or status='cancelled' or (status in ('assigned','arrived','ongoing','finished') and driver_id is not null))
);
create unique index one_passenger_trip on public.trips(passenger_id) where status not in ('finished','cancelled');
create unique index one_driver_trip on public.trips(driver_id) where status not in ('finished','cancelled');
create index trips_created on public.trips(created_at desc);
create function private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id) values(new.id);return new;end;$$;
revoke all on function private.new_profile() from public,anon,authenticated;
create trigger new_user after insert on auth.users for each row execute function private.new_profile();
create function private.my_role() returns text language sql stable security definer set search_path='' as $$select role from public.profiles where id=auth.uid()$$;
create function private.can_receive() returns boolean language sql stable security definer set search_path='' as $$select coalesce((select role='driver' and approved and available from public.profiles where id=auth.uid()),false)$$;
revoke all on function private.my_role(),private.can_receive() from public,anon;
grant execute on function private.my_role(),private.can_receive() to authenticated;
alter table public.profiles enable row level security;
alter table public.service_settings enable row level security;
alter table public.trips enable row level security;
revoke all on public.profiles,public.service_settings,public.trips from anon,authenticated;
grant select on public.profiles,public.service_settings,public.trips to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()) or (select private.my_role())='admin');
create policy settings_read on public.service_settings for select to authenticated using(true);
create policy trips_read on public.trips for select to authenticated using(passenger_id=(select auth.uid()) or driver_id=(select auth.uid()) or (select private.my_role())='admin' or (status='searching' and (select private.can_receive())));
-- Mutaciones en una única transacción, sin conceder UPDATE arbitrario al navegador.
-- La función privilegiada vive en esquema privado y comprueba identidad, rol y estado.
create function private.operate(action text,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); p public.profiles; t public.trips; s public.service_settings; current_clock time:=(now() at time zone 'America/Caracas')::time; next_status text;
begin
 if uid is null then raise exception 'No autorizado';end if;
 -- Serializa mutaciones del piloto, incluidas suspensión, configuración y aceptación.
 perform pg_advisory_xact_lock(4173001);
 select * into strict p from public.profiles where id=uid;
 if action='request' then
  if p.role<>'passenger' then raise exception 'Solo pasajeros';end if;
  select * into strict s from public.service_settings where id=1;
  if not s.enabled or not ((s.open_time=s.close_time) or (s.open_time<s.close_time and current_clock>=s.open_time and current_clock<s.close_time) or (s.open_time>s.close_time and (current_clock>=s.open_time or current_clock<s.close_time))) then raise exception 'Servicio cerrado';end if;
  if not coalesce((payload->>'zone')=any(s.zones),false) then raise exception 'Fuera de cobertura';end if;
  insert into public.trips(passenger_id,origin,destination,zone) values(uid,trim(payload->>'origin'),trim(payload->>'destination'),payload->>'zone');
 elsif action in ('accept','advance','cancel') then
  select * into strict t from public.trips where id=(payload->>'id')::uuid for update;
  if action='accept' then
   if p.role<>'driver' or not p.approved or not p.available or t.status<>'searching' then raise exception 'No disponible';end if;
   update public.trips set driver_id=uid,status='assigned' where id=t.id;
  elsif action='advance' then
   if p.role<>'driver' or not p.approved or t.driver_id is distinct from uid then raise exception 'No autorizado';end if;
   next_status:=case t.status when 'assigned' then 'arrived' when 'arrived' then 'ongoing' when 'ongoing' then 'finished' else null end;
   if next_status is null then raise exception 'Estado inválido';end if;
   update public.trips set status=next_status where id=t.id;
  else
   if t.passenger_id<>uid or t.status not in ('searching','assigned','arrived') then raise exception 'Cancelación inválida';end if;
   update public.trips set status='cancelled' where id=t.id;
  end if;
 elsif action='available' then
  if p.role<>'driver' or not p.approved then raise exception 'No autorizado';end if;
  update public.profiles set available=(payload->>'available')::boolean where id=uid;
 elsif action='driver' then
  if p.role<>'admin' then raise exception 'No autorizado';end if;
  if exists(select 1 from public.trips where driver_id=(payload->>'id')::uuid and status not in ('finished','cancelled')) then raise exception 'Conductor ocupado';end if;
  update public.profiles set role='driver',approved=(payload->>'approved')::boolean,available=false where id=(payload->>'id')::uuid and role<>'admin';
 elsif action='settings' then
  if p.role<>'admin' then raise exception 'No autorizado';end if;
  update public.service_settings set enabled=(payload->>'enabled')::boolean,open_time=(payload->>'open_time')::time,close_time=(payload->>'close_time')::time,zones=array(select jsonb_array_elements_text(payload->'zones')) where id=1;
 else raise exception 'Acción desconocida';end if;
end;$$;
revoke all on function private.operate(text,jsonb) from public,anon;
grant execute on function private.operate(text,jsonb) to authenticated;
create function public.operate(action text,payload jsonb) returns void language sql security invoker set search_path='' as $$select private.operate(action,payload)$$;
revoke all on function public.operate(text,jsonb) from public,anon;
grant execute on function public.operate(text,jsonb) to authenticated;
alter publication supabase_realtime add table public.trips,public.profiles,public.service_settings;
-- El primer admin se asigna desde SQL con un UUID verificado, nunca desde el registro público.
