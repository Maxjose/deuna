-- Teléfono de contacto de la otra persona del viaje, solo mientras el viaje está activo (asignado, en recogida o en curso).
create or replace function private.trip_person(trip_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.trips;uid uuid:=auth.uid();peer uuid;person_name text;person_phone text;begin
 if uid is null then raise exception 'No autorizado';end if;
 select * into strict t from public.trips where id=trip_id;
 if not coalesce((t.passenger_id=uid or t.driver_id=uid or (t.status='searching' and private.can_receive())),false) then raise exception 'No autorizado';end if;
 peer:=case when t.passenger_id=uid then t.driver_id else t.passenger_id end;
 if peer is null then return null;end if;
 select coalesce(nullif(btrim(left(raw_user_meta_data->>'display_name',80)),''),nullif(btrim(left(raw_user_meta_data->>'full_name',80)),''),case when t.passenger_id=uid then 'Tu conductor' else 'Tu pasajero' end),
  nullif(regexp_replace(coalesce(raw_user_meta_data->>'contact_phone',''),'[^0-9+]','','g'),'')
 into person_name,person_phone from auth.users where id=peer;
 return jsonb_build_object('name',person_name,'rating',private.user_reputation(peer),
  'phone',case when t.status in ('assigned','arrived','ongoing') and (t.passenger_id=uid or t.driver_id=uid) then left(person_phone,20) end);
end $$;
