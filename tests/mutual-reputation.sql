-- Disposable data; no fixtures are committed or notifications delivered.
begin;
select set_config('qa.p',gen_random_uuid()::text,true),set_config('qa.d',gen_random_uuid()::text,true),set_config('qa.other',gen_random_uuid()::text,true),set_config('qa.t',gen_random_uuid()::text,true);
insert into auth.users(id,email) select current_setting(k)::uuid,'qa-'||current_setting(k)||'@example.invalid' from unnest(array['qa.p','qa.d','qa.other'])k;
update public.profiles set role='driver',approved=true,available=true where id=current_setting('qa.d')::uuid;
insert into public.trips(id,passenger_id,origin,destination,status) values(current_setting('qa.t')::uuid,current_setting('qa.p')::uuid,'QA origen','QA destino','searching');
select set_config('request.jwt.claim.sub',current_setting('qa.d'),true);
set local role authenticated;
do $$begin if (public.trip_person(current_setting('qa.t')::uuid)->'rating'->>'count')::integer<>0 then raise exception 'New person rating wrong';end if;end $$;
reset role;
update public.trips set driver_id=current_setting('qa.d')::uuid,status='finished' where id=current_setting('qa.t')::uuid;
set local role authenticated;
do $$begin
 if public.trip_feedback('pending')->>'id'<>current_setting('qa.t') then raise exception 'Driver completion absent';end if;
 perform public.trip_feedback('rate',current_setting('qa.t')::uuid,2);
 perform public.trip_feedback('rate',current_setting('qa.t')::uuid,5);
 if (public.user_reputation(current_setting('qa.p')::uuid)->>'average')::numeric<>2 then raise exception 'Duplicate driver vote';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.p'),true);
select public.trip_feedback('rate',current_setting('qa.t')::uuid,5);
reset role;
insert into public.trips(passenger_id,driver_id,origin,destination,status) values(current_setting('qa.p')::uuid,current_setting('qa.d')::uuid,'QA segunda recogida','QA segundo destino','finished') returning set_config('qa.t2',id::text,true);
set local role authenticated;
select public.trip_feedback('rate',current_setting('qa.t2')::uuid,4);
select set_config('request.jwt.claim.sub',current_setting('qa.d'),true);
select public.trip_feedback('rate',current_setting('qa.t2')::uuid,3);
do $$begin
 if (public.user_reputation(current_setting('qa.p')::uuid)->>'average')::numeric<>2.5 then raise exception 'Passenger average';end if;
 if (public.user_reputation(current_setting('qa.d')::uuid)->>'average')::numeric<>4.5 then raise exception 'Driver average';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.other'),true);
do $$begin begin perform public.trip_person(current_setting('qa.t')::uuid);raise exception 'Outsider accessed trip';exception when raise_exception then if sqlerrm<>'No autorizado' then raise;end if;end;end $$;
rollback;
