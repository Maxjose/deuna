-- Ubicación en vivo: permisos, validación, frecuencia, realtime y borrado. Transacción con rollback.
begin;
select set_config('qa.passenger',gen_random_uuid()::text,true),set_config('qa.driver',gen_random_uuid()::text,true),
 set_config('qa.other_driver',gen_random_uuid()::text,true),set_config('qa.other',gen_random_uuid()::text,true),
 set_config('qa.admin',gen_random_uuid()::text,true),set_config('qa.trip',gen_random_uuid()::text,true);
insert into auth.users(id,email) select current_setting(k)::uuid,'qa-'||current_setting(k)||'@example.invalid'
 from unnest(array['qa.passenger','qa.driver','qa.other_driver','qa.other','qa.admin']) k;
update public.profiles set role='driver',approved=true where id in (current_setting('qa.driver')::uuid,current_setting('qa.other_driver')::uuid);
update public.profiles set role='admin' where id=current_setting('qa.admin')::uuid;
insert into public.trips(id,passenger_id,driver_id,origin,destination,status)
 values(current_setting('qa.trip')::uuid,current_setting('qa.passenger')::uuid,current_setting('qa.driver')::uuid,'QA recogida','QA destino','assigned');

set local role authenticated;
-- Escritura directa bloqueada para cualquiera.
select set_config('request.jwt.claim.sub',current_setting('qa.driver'),true);
do $$begin
 begin insert into public.trip_locations(trip_id,driver_id,latitude,longitude,accuracy,recorded_at) values(current_setting('qa.trip')::uuid,current_setting('qa.driver')::uuid,10.7,-71.6,10,now());
  raise exception 'Direct insert allowed'; exception when insufficient_privilege then null; end;
end $$;
-- El motorizado asignado comparte su posición.
do $$begin
 if (public.share_location(current_setting('qa.trip')::uuid,10.70,-71.60,12)->>'saved')<>'true' then raise exception 'Driver could not share'; end if;
 -- Una segunda posición inmediata se ignora (límite de frecuencia), sin error.
 if (public.share_location(current_setting('qa.trip')::uuid,10.71,-71.61,12)->>'saved')<>'false' then raise exception 'Rate limit missing'; end if;
 if (select latitude from public.trip_locations where trip_id=current_setting('qa.trip')::uuid)<>10.70 then raise exception 'Driver cannot read own'; end if;
end $$;
-- Validación de datos.
do $$declare bad text[]:=array[]::text[];begin
 begin perform public.share_location(current_setting('qa.trip')::uuid,95,-71.6,10); bad:=bad||'lat'; exception when raise_exception then null; end;
 begin perform public.share_location(current_setting('qa.trip')::uuid,'NaN',-71.6,10); bad:=bad||'nan'; exception when raise_exception then null; end;
 begin perform public.share_location(current_setting('qa.trip')::uuid,10.7,-71.6,5000); bad:=bad||'accuracy'; exception when raise_exception then null; end;
 begin perform public.share_location(current_setting('qa.trip')::uuid,10.7,-71.6,10,400); bad:=bad||'heading'; exception when raise_exception then null; end;
 begin perform public.share_location(current_setting('qa.trip')::uuid,10.7,-71.6,10,null,null,now()-interval '10 minutes'); bad:=bad||'old'; exception when raise_exception then null; end;
 begin perform public.share_location(current_setting('qa.trip')::uuid,10.7,-71.6,10,null,null,now()+interval '10 minutes'); bad:=bad||'future'; exception when raise_exception then null; end;
 if cardinality(bad)>0 then raise exception 'Accepted invalid: %',bad; end if;
end $$;
-- Otro motorizado no puede escribir ni leer.
select set_config('request.jwt.claim.sub',current_setting('qa.other_driver'),true);
do $$begin
 begin perform public.share_location(current_setting('qa.trip')::uuid,10.7,-71.6,10); raise exception 'Other driver can write';
 exception when raise_exception then if sqlerrm<>'Este viaje ya no comparte ubicación' then raise; end if; end;
 if exists(select 1 from public.trip_locations) then raise exception 'Other driver can read'; end if;
end $$;
-- Otro pasajero no puede leer ni escribir.
select set_config('request.jwt.claim.sub',current_setting('qa.other'),true);
do $$begin
 if exists(select 1 from public.trip_locations) then raise exception 'Outsider can read'; end if;
 begin perform public.share_location(current_setting('qa.trip')::uuid,10.7,-71.6,10); raise exception 'Passenger role can write';
 exception when raise_exception then if sqlerrm<>'No autorizado' then raise; end if; end;
end $$;
-- El pasajero del viaje y la administración sí la leen.
select set_config('request.jwt.claim.sub',current_setting('qa.passenger'),true);
do $$begin
 if (select count(*) from public.trip_locations where trip_id=current_setting('qa.trip')::uuid)<>1 then raise exception 'Passenger cannot read'; end if;
 begin perform public.share_location(current_setting('qa.trip')::uuid,10.7,-71.6,10); raise exception 'Passenger can write';
 exception when raise_exception then if sqlerrm<>'No autorizado' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.admin'),true);
do $$begin if (select count(*) from public.trip_locations)<>1 then raise exception 'Admin cannot read'; end if; end $$;

reset role;
-- Pasado el límite de frecuencia, la nueva posición reemplaza a la anterior.
update public.trip_locations set updated_at=now()-interval '5 seconds',recorded_at=now()-interval '5 seconds' where trip_id=current_setting('qa.trip')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.driver'),true);
do $$begin
 if (public.share_location(current_setting('qa.trip')::uuid,10.72,-71.62,8,90,5.5)->>'saved')<>'true' then raise exception 'Update not saved'; end if;
 if (select latitude from public.trip_locations where trip_id=current_setting('qa.trip')::uuid)<>10.72 then raise exception 'Update not applied'; end if;
end $$;
reset role;
-- Publicada para tiempo real y borrada al terminar el viaje.
do $$begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='trip_locations') then raise exception 'Not in realtime publication'; end if;
end $$;
update public.trips set status='ongoing' where id=current_setting('qa.trip')::uuid;
do $$begin if not exists(select 1 from public.trip_locations where trip_id=current_setting('qa.trip')::uuid) then raise exception 'Purged too early'; end if; end $$;
update public.trips set status='finished' where id=current_setting('qa.trip')::uuid;
do $$begin if exists(select 1 from public.trip_locations where trip_id=current_setting('qa.trip')::uuid) then raise exception 'Location not purged'; end if; end $$;
-- Tras terminar, el motorizado ya no puede compartir en ese viaje.
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.driver'),true);
do $$begin
 begin perform public.share_location(current_setting('qa.trip')::uuid,10.7,-71.6,10); raise exception 'Finished trip accepts location';
 exception when raise_exception then if sqlerrm<>'Este viaje ya no comparte ubicación' then raise; end if; end;
end $$;
reset role;
select 'trip-locations ok';
rollback;
