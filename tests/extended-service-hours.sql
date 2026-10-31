begin;
select set_config('qa.driver',gen_random_uuid()::text,true),set_config('qa.passenger',gen_random_uuid()::text,true);
insert into auth.users(id,email) select current_setting(k)::uuid,'hours-'||current_setting(k)||'@example.invalid' from unnest(array['qa.driver','qa.passenger'])k;
update public.profiles set available=false where available;
update public.service_settings set enabled=true,open_time='06:00',close_time='22:00' where id=1;
do $$begin
 if not private.service_is_open('12:00') then raise exception 'Scheduled service closed without drivers';end if;
 if private.service_is_open('23:00') then raise exception 'After-hours open without drivers';end if;
end $$;
update public.profiles set role='driver',approved=true,available=true where id=current_setting('qa.driver')::uuid;
do $$begin if not private.service_is_open('23:00') then raise exception 'Fresh available driver did not open service';end if;end $$;
update private.driver_presence set last_seen=now()-interval '2 hours' where driver_id=current_setting('qa.driver')::uuid;
do $$begin if private.service_is_open('23:00') then raise exception 'Stale driver opened service';end if;end $$;
update private.driver_presence set last_seen=now(),last_activity=now() where driver_id=current_setting('qa.driver')::uuid;
update public.profiles set suspended=true where id=current_setting('qa.driver')::uuid;
do $$begin if private.service_is_open('23:00') then raise exception 'Suspended driver opened service';end if;end $$;
update public.profiles set suspended=false,approved=false where id=current_setting('qa.driver')::uuid;
do $$begin if private.service_is_open('23:00') then raise exception 'Unapproved driver opened service';end if;end $$;
update public.profiles set approved=true where id=current_setting('qa.driver')::uuid;
insert into public.trips(passenger_id,driver_id,origin,destination,status) values(current_setting('qa.passenger')::uuid,current_setting('qa.driver')::uuid,'Hours origin','Hours destination','assigned');
do $$begin if private.service_is_open('23:00') then raise exception 'Busy driver opened service';end if;end $$;
update public.trips set status='finished' where passenger_id=current_setting('qa.passenger')::uuid;
update public.service_settings set enabled=false where id=1;
do $$begin
 if private.service_is_open('12:00') or private.service_is_open('23:00') then raise exception 'Master pause ignored';end if;
end $$;
update public.profiles set available=false where available;
update public.service_settings set enabled=true,open_time='22:00',close_time='06:00' where id=1;
do $$begin
 if not private.service_is_open('23:00') or not private.service_is_open('05:59') or private.service_is_open('06:00') then raise exception 'Midnight boundaries wrong';end if;
end $$;
-- The request path must use the same guard, before quote validation.
update public.service_settings set open_time=((now() at time zone 'America/Caracas')+interval '2 hours')::time,close_time=((now() at time zone 'America/Caracas')+interval '3 hours')::time where id=1;
select set_config('request.jwt.claim.sub',current_setting('qa.passenger'),true);
set local role authenticated;
do $$begin
 if (public.service_status()->>'open')::boolean then raise exception 'Client/server status mismatch';end if;
 begin perform public.operate('request','{}');raise exception 'Closed request allowed';exception when raise_exception then if sqlerrm<>'Servicio cerrado' then raise;end if;end;
end $$;
reset role;
rollback;
