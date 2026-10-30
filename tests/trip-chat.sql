-- Disposable participants and messages; transaction always rolled back.
begin;
select set_config('qa.passenger',gen_random_uuid()::text,true),set_config('qa.driver',gen_random_uuid()::text,true),set_config('qa.other',gen_random_uuid()::text,true),set_config('qa.trip',gen_random_uuid()::text,true),set_config('qa.message',gen_random_uuid()::text,true);
insert into auth.users(id,email) select current_setting(k)::uuid,'qa-'||current_setting(k)||'@example.invalid' from unnest(array['qa.passenger','qa.driver','qa.other']) k;
update public.profiles set role='driver',approved=true where id=current_setting('qa.driver')::uuid;
insert into public.trips(id,passenger_id,driver_id,origin,destination,status) values(current_setting('qa.trip')::uuid,current_setting('qa.passenger')::uuid,current_setting('qa.driver')::uuid,'QA recogida','QA destino','assigned');
select set_config('request.jwt.claim.sub',current_setting('qa.passenger'),true);
set local role authenticated;
select public.trip_chat('send',current_setting('qa.trip')::uuid,'Hola',current_setting('qa.message')::uuid)->'trip'->>'status' as state;
select public.trip_chat('send',current_setting('qa.trip')::uuid,'Hola',current_setting('qa.message')::uuid)->'trip'->>'status' as retry_state;
do $$begin if jsonb_array_length(public.trip_chat('fetch')->'messages')<>1 then raise exception 'Duplicate message';end if;end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.driver'),true);
do $$begin if jsonb_array_length(public.trip_chat('fetch')->'messages')<>1 then raise exception 'Driver cannot read';end if;end $$;
select public.trip_chat('send',current_setting('qa.trip')::uuid,'Respuesta del motorizado',gen_random_uuid())->'trip'->>'status';
select set_config('request.jwt.claim.sub',current_setting('qa.passenger'),true);
do $$declare response jsonb;begin
 response:=public.trip_chat('fetch');
 if response->'trip'->>'status'<>'assigned' or response->'trip'->>'peer_name' is null or jsonb_array_length(response->'messages')<>2 then raise exception 'Passenger cannot open or receive';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.other'),true);
do $$begin
 if (public.trip_chat('fetch',current_setting('qa.trip')::uuid)->'trip')<>'null'::jsonb then raise exception 'Outsider can read';end if;
 begin perform public.trip_chat('send',current_setting('qa.trip')::uuid,'Intruso',gen_random_uuid());raise exception 'Outsider can send';exception when raise_exception then if sqlerrm<>'El chat de este viaje ya no está disponible' then raise;end if;end;
end $$;
reset role;
update public.trips set status='finished' where id=current_setting('qa.trip')::uuid;
do $$begin if exists(select 1 from private.trip_messages where trip_id=current_setting('qa.trip')::uuid) then raise exception 'Chat not purged';end if;end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.passenger'),true);
do $$begin
 if (public.trip_chat('fetch')->'trip')<>'null'::jsonb then raise exception 'Finished chat accessible';end if;
 begin perform public.trip_chat('send',current_setting('qa.trip')::uuid,'Tarde',gen_random_uuid());raise exception 'Late send allowed';exception when raise_exception then if sqlerrm<>'El chat de este viaje ya no está disponible' then raise;end if;end;
end $$;
rollback;
