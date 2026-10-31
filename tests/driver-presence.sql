-- All fixtures and configuration changes are rolled back.
begin;
select set_config('qa.driver',gen_random_uuid()::text,true),set_config('qa.passenger',gen_random_uuid()::text,true),set_config('qa.admin',gen_random_uuid()::text,true),set_config('qa.trip',gen_random_uuid()::text,true);
insert into auth.users(id,email) select current_setting(k)::uuid,'presence-'||current_setting(k)||'@example.invalid' from unnest(array['qa.driver','qa.passenger','qa.admin'])k;
update public.profiles set role='driver',approved=true,available=true where id=current_setting('qa.driver')::uuid;
update public.profiles set role='admin' where id=current_setting('qa.admin')::uuid;
select set_config('request.jwt.claim.sub',current_setting('qa.passenger'),true);
set local role authenticated;
do $$begin
 begin perform public.driver_presence('save','{"signal_minutes":5,"idle_minutes":30,"grace_minutes":2}');raise exception 'Passenger changed settings';exception when raise_exception then if sqlerrm<>'No autorizado' then raise;end if;end;
 begin perform public.driver_presence('heartbeat');raise exception 'Passenger heartbeat allowed';exception when raise_exception then if sqlerrm<>'No autorizado' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.admin'),true);
select public.driver_presence('save','{"signal_minutes":5,"idle_minutes":30,"grace_minutes":2}');
do $$begin
 begin perform public.driver_presence('save','{"signal_minutes":0,"idle_minutes":30,"grace_minutes":2}');raise exception 'Invalid settings allowed';exception when check_violation then null;end;
end $$;
reset role;
update private.driver_presence set last_activity=now()-interval '31 minutes' where driver_id=current_setting('qa.driver')::uuid;
select set_config('request.jwt.claim.sub',current_setting('qa.driver'),true);
set local role authenticated;
do $$declare response jsonb;begin
 response:=public.driver_presence('heartbeat','{"activity":true}');
 if not (response->>'confirmation_due')::boolean then raise exception 'Interaction dismissed overdue confirmation';end if;
 response:=public.driver_presence('confirm');
 if (response->>'confirmation_due')::boolean or not (response->>'available')::boolean then raise exception 'Confirmation failed';end if;
end $$;
reset role;
update private.driver_presence set last_activity=now()-interval '33 minutes' where driver_id=current_setting('qa.driver')::uuid;
set local role authenticated;
do $$declare response jsonb;begin
 response:=public.driver_presence('confirm');
 if (response->>'available')::boolean or response->>'reason'<>'idle' then raise exception 'Late confirm reconnected driver';end if;
 perform public.operate('available','{"available":true}');
end $$;
reset role;
update private.driver_presence set last_seen=now()-interval '6 minutes' where driver_id=current_setting('qa.driver')::uuid;
set local role authenticated;
do $$declare response jsonb;begin
 response:=public.driver_presence('heartbeat');
 if (response->>'available')::boolean or response->>'reason'<>'signal' then raise exception 'Late heartbeat reconnected driver';end if;
 perform public.operate('available','{"available":true}');
end $$;
reset role;
insert into public.trips(id,passenger_id,driver_id,origin,destination,status) values(current_setting('qa.trip')::uuid,current_setting('qa.passenger')::uuid,current_setting('qa.driver')::uuid,'Presence origin','Presence destination','assigned');
update private.driver_presence set last_seen=now()-interval '2 hours',last_activity=now()-interval '2 hours' where driver_id=current_setting('qa.driver')::uuid;
select private.expire_driver_presence(current_setting('qa.driver')::uuid);
do $$begin
 if not (select available from public.profiles where id=current_setting('qa.driver')::uuid) then raise exception 'Active driver expired';end if;
end $$;
update public.trips set status='finished' where id=current_setting('qa.trip')::uuid;
do $$begin
 if not exists(select 1 from private.driver_presence where driver_id=current_setting('qa.driver')::uuid and last_seen=now() and last_activity=now()) then raise exception 'Trip finish did not reset timers';end if;
end $$;
-- A stale driver cannot accept even before the scheduled job executes.
insert into public.trips(passenger_id,origin,destination,status) values(current_setting('qa.passenger')::uuid,'Other origin','Other destination','searching') returning set_config('qa.request',id::text,true);
update private.driver_presence set last_seen=now()-interval '6 minutes' where driver_id=current_setting('qa.driver')::uuid;
set local role authenticated;
do $$begin
 begin perform public.operate('accept',jsonb_build_object('id',current_setting('qa.request')));raise exception 'Stale driver accepted';exception when raise_exception then if sqlerrm<>'Disponibilidad vencida' then raise;end if;end;
end $$;
reset role;
select private.expire_driver_presence(current_setting('qa.driver')::uuid);
do $$begin
 if (select available from public.profiles where id=current_setting('qa.driver')::uuid) then raise exception 'Scheduled expiry failed';end if;
end $$;
rollback;
