create table private.passenger_ratings(trip_id uuid primary key references public.trips(id) on delete cascade,passenger_id uuid not null references public.profiles(id),driver_id uuid not null references public.profiles(id),stars integer check(stars between 1 and 5),created_at timestamptz not null default now());
create index passenger_ratings_person on private.passenger_ratings(passenger_id) where stars is not null;
alter table private.passenger_ratings enable row level security;
revoke all on private.passenger_ratings from public,anon,authenticated;
insert into private.passenger_ratings(trip_id,passenger_id,driver_id) select id,passenger_id,driver_id from public.trips where status='finished';
create or replace function private.trip_feedback(action text,trip_id uuid default null,stars integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();t public.trips;peer uuid;peer_name text;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role in ('passenger','driver') and not suspended) then raise exception 'No autorizado';end if;
 perform pg_advisory_xact_lock(4173001);
 if action='pending' then
  select * into t from public.trips x where status='finished' and ((passenger_id=uid and not exists(select 1 from private.trip_ratings r where r.trip_id=x.id)) or (driver_id=uid and not exists(select 1 from private.passenger_ratings r where r.trip_id=x.id))) order by created_at desc limit 1;
  if t.id is null then return null;end if;
  peer:=case when t.passenger_id=uid then t.driver_id else t.passenger_id end;
  select coalesce(nullif(btrim(raw_user_meta_data->>'display_name'),''),case when t.passenger_id=uid then 'Tu motorizado' else 'Tu pasajero' end) into peer_name from auth.users where id=peer;
  return jsonb_build_object('id',t.id,'destination',t.destination,'driver_name',peer_name);
 end if;
 select * into strict t from public.trips where id=trip_id and (passenger_id=uid or driver_id=uid) and status='finished';
 if action='rate' and (stars is null or stars not between 1 and 5) then raise exception 'Calificación inválida';end if;
 if action not in ('rate','dismiss') then raise exception 'Acción inválida';end if;
 if t.passenger_id=uid then
  insert into private.trip_ratings(trip_id,passenger_id,driver_id,stars) values(t.id,t.passenger_id,t.driver_id,case when action='rate' then stars end) on conflict do nothing;
 else
  insert into private.passenger_ratings(trip_id,passenger_id,driver_id,stars) values(t.id,t.passenger_id,t.driver_id,case when action='rate' then stars end) on conflict do nothing;
 end if;
 return jsonb_build_object('saved',true);
end $$;
create function private.user_reputation(person_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and not suspended) or not (person_id=uid or exists(select 1 from public.profiles where id=uid and role='admin') or exists(select 1 from public.trips where (passenger_id=uid and driver_id=person_id) or (driver_id=uid and passenger_id=person_id)) or (private.can_receive() and not exists(select 1 from public.trips where driver_id=uid and status in ('assigned','arrived','ongoing')) and exists(select 1 from public.trips where passenger_id=person_id and status='searching'))) then raise exception 'No autorizado';end if;
 return (select jsonb_build_object('average',round(avg(stars),2),'count',count(stars)) from (select stars from private.trip_ratings where driver_id=person_id union all select stars from private.passenger_ratings where passenger_id=person_id)r);
end $$;
revoke all on function private.user_reputation(uuid) from public,anon;
grant execute on function private.user_reputation(uuid) to authenticated;
create function public.user_reputation(person_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.user_reputation(person_id)$$;
revoke all on function public.user_reputation(uuid) from public,anon;
grant execute on function public.user_reputation(uuid) to authenticated;
create function private.trip_person(trip_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.trips;uid uuid:=auth.uid();peer uuid;person_name text;begin
 if uid is null then raise exception 'No autorizado';end if;
 select * into strict t from public.trips where id=trip_id;
 if not coalesce((t.passenger_id=uid or t.driver_id=uid or (t.status='searching' and private.can_receive())),false) then raise exception 'No autorizado';end if;
 peer:=case when t.passenger_id=uid then t.driver_id else t.passenger_id end;
 if peer is null then return null;end if;
 select coalesce(nullif(btrim(left(raw_user_meta_data->>'display_name',80)),''),nullif(btrim(left(raw_user_meta_data->>'full_name',80)),''),case when t.passenger_id=uid then 'Tu motorizado' else 'Tu pasajero' end) into person_name from auth.users where id=peer;
 return jsonb_build_object('name',person_name,'rating',private.user_reputation(peer));
end $$;
revoke all on function private.trip_person(uuid) from public,anon;
grant execute on function private.trip_person(uuid) to authenticated;
create function public.trip_person(trip_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.trip_person(trip_id)$$;
revoke all on function public.trip_person(uuid) from public,anon;
grant execute on function public.trip_person(uuid) to authenticated;
