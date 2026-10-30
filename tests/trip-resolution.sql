-- Disposable accounts, trips and feedback. No fixture changes are committed.
begin;
select set_config('qa.p',gen_random_uuid()::text,true),set_config('qa.d',gen_random_uuid()::text,true),set_config('qa.t',gen_random_uuid()::text,true);
insert into auth.users(id,email) select current_setting(k)::uuid,'qa-'||current_setting(k)||'@example.invalid' from unnest(array['qa.p','qa.d'])k;
update public.profiles set role='driver',approved=true,available=true where id=current_setting('qa.d')::uuid;
insert into public.trips(id,passenger_id,driver_id,origin,destination,status) values(current_setting('qa.t')::uuid,current_setting('qa.p')::uuid,current_setting('qa.d')::uuid,'QA origen','QA destino','assigned');
select set_config('request.jwt.claim.sub',current_setting('qa.d'),true);
set local role authenticated;
do $$begin
 begin perform public.operate('available','{"available":false}');raise exception 'Disconnect allowed';exception when raise_exception then if sqlerrm<>'Completa tu viaje activo primero' then raise;end if;end;
 perform public.operate('request_cancel',jsonb_build_object('id',current_setting('qa.t')));
 begin perform public.operate('respond_cancel',jsonb_build_object('id',current_setting('qa.t'),'approved',true));raise exception 'Driver self authorized';exception when raise_exception then if sqlerrm<>'No autorizado' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.p'),true);
select public.operate('respond_cancel',jsonb_build_object('id',current_setting('qa.t'),'approved',false));
reset role;
do $$begin if not exists(select 1 from public.trips where id=current_setting('qa.t')::uuid and status='assigned' and not cancel_requested) then raise exception 'Rejection failed';end if;end $$;
update public.trips set status='finished' where id=current_setting('qa.t')::uuid;
set local role authenticated;
do $$begin
 if public.trip_feedback('pending')->>'id'<>current_setting('qa.t') then raise exception 'Completion missing';end if;
 begin perform public.trip_feedback('rate',current_setting('qa.t')::uuid,6);raise exception 'Invalid rating accepted';exception when raise_exception then if sqlerrm<>'Calificación inválida' then raise;end if;end;
 perform public.trip_feedback('rate',current_setting('qa.t')::uuid,5);
 perform public.trip_feedback('rate',current_setting('qa.t')::uuid,1);
 if (public.driver_reputation(current_setting('qa.d')::uuid)->>'average')::numeric<>5 or (public.driver_reputation(current_setting('qa.d')::uuid)->>'count')::integer<>1 then raise exception 'Duplicate rating or average wrong';end if;
 if public.trip_feedback('pending') is not null then raise exception 'Completion not acknowledged';end if;
end $$;
rollback;
