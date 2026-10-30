create table private.trip_messages (
 id uuid primary key, trip_id uuid not null references public.trips(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade,
 body text not null check(length(btrim(body)) between 1 and 1000), created_at timestamptz not null default clock_timestamp()
);
create index trip_messages_recent on private.trip_messages(trip_id,created_at desc,id);
alter table private.trip_messages enable row level security;
revoke all on private.trip_messages from public,anon,authenticated;
create function private.close_trip_chat() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('finished','cancelled') then delete from private.trip_messages where trip_id=new.id;end if;
 return new;
end $$;
revoke all on function private.close_trip_chat() from public,anon,authenticated;
create trigger close_trip_chat after update of status on public.trips for each row execute function private.close_trip_chat();
create function private.trip_chat(action text,trip_id uuid default null,message text default '',client_message_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();t public.trips;peer uuid;peer_name text;result jsonb;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and not suspended and role in ('passenger','driver')) then raise exception 'No autorizado';end if;
 perform pg_advisory_xact_lock(4173001);
 select * into t from public.trips where (passenger_id=uid or driver_id=uid) and status in ('searching','assigned','arrived','ongoing') and (trip_id is null or id=trip_id) order by created_at desc limit 1;
 if t.id is null then
  if action='send' then raise exception 'El chat de este viaje ya no está disponible';end if;
  return jsonb_build_object('trip',null,'messages','[]'::jsonb);
 end if;
 if action='send' then
  if t.driver_id is null or t.status='searching' then raise exception 'Espera a que un motorizado acepte el viaje';end if;
  if client_message_id is null or message is null or length(btrim(message)) not between 1 and 1000 then raise exception 'Mensaje inválido';end if;
  if exists(select 1 from private.trip_messages m where m.id=client_message_id and (m.sender_id<>uid or m.trip_id<>t.id or m.body<>btrim(message))) then raise exception 'Mensaje inválido';end if;
  if not exists(select 1 from private.trip_messages m where m.id=client_message_id) then
   if (select count(*) from private.trip_messages m where m.trip_id=t.id and m.sender_id=uid and m.created_at>clock_timestamp()-interval '30 seconds')>=20 then raise exception 'Espera unos segundos antes de enviar más mensajes';end if;
   insert into private.trip_messages(id,trip_id,sender_id,body) values(client_message_id,t.id,uid,btrim(message));
  end if;
 elsif action<>'fetch' then raise exception 'Acción inválida';end if;
 peer:=case when uid=t.passenger_id then t.driver_id else t.passenger_id end;
 select coalesce(nullif(btrim(left(raw_user_meta_data->>'display_name',80)),''),nullif(btrim(left(raw_user_meta_data->>'full_name',80)),''),case when uid=t.passenger_id then 'Tu motorizado' else 'Tu pasajero' end) into peer_name from auth.users where id=peer;
 select coalesce(jsonb_agg(to_jsonb(m) order by created_at,id),'[]'::jsonb) into result from (select id,sender_id,body,created_at from private.trip_messages m where m.trip_id=t.id order by created_at desc,id desc limit 200)m;
 return jsonb_build_object('trip',jsonb_build_object('id',t.id,'status',t.status,'origin',t.origin,'destination',t.destination,'peer_name',peer_name,'peer_role',case when uid=t.passenger_id then 'Motorizado · Moto' else 'Pasajero' end),'messages',result);
end $$;
revoke all on function private.trip_chat(text,uuid,text,uuid) from public,anon;
grant execute on function private.trip_chat(text,uuid,text,uuid) to authenticated;
create function public.trip_chat(action text,trip_id uuid default null,message text default '',client_message_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.trip_chat(action,trip_id,message,client_message_id)$$;
revoke all on function public.trip_chat(text,uuid,text,uuid) from public,anon;
grant execute on function public.trip_chat(text,uuid,text,uuid) to authenticated;
