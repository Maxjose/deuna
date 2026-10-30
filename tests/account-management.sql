-- Uses a disposable account inside a transaction. Requires one administrator.
begin;
select set_config('qa.admin',(select id::text from public.profiles where role='admin' limit 1),true);
select set_config('qa.person',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('qa.person')::uuid,'qa-account-'||current_setting('qa.person')||'@example.invalid');
select set_config('request.jwt.claim.sub',current_setting('qa.admin'),true);
set local role authenticated;
do $$declare person uuid:=current_setting('qa.person')::uuid;r jsonb;begin
 r:=public.admin_records('users','qa-account-'||person::text,0);if (r->>'total')::integer<>1 then raise exception 'User segmentation failed';end if;
 r:=public.admin_records('team','qa-account-'||person::text,0);if (r->>'total')::integer<>0 then raise exception 'Team segmentation failed';end if;
 perform public.admin_manage(person,'suspend_account');
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.person'),true);
do $$begin
 begin perform public.operate('available','{"available":true}'::jsonb);raise exception 'Suspension bypass';
 exception when raise_exception then if sqlerrm<>'Cuenta suspendida' then raise;end if;end;
 begin perform public.admin_manage(current_setting('qa.admin')::uuid,'suspend_account');raise exception 'Unauthorized manage';
 exception when raise_exception then if sqlerrm<>'Solo administradores' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.admin'),true);
do $$declare person uuid:=current_setting('qa.person')::uuid;r jsonb;begin
 perform public.admin_manage(person,'restore_account');
 perform public.admin_manage(person,'assign_driver');
 r:=public.admin_records('team','qa-account-'||person::text,0);if (r->>'total')::integer<>1 then raise exception 'Driver assignment failed';end if;
 perform public.admin_manage(person,'approve_driver');
 perform public.admin_manage(person,'suspend_driver');
 r:=public.admin_records('person:'||person::text,'',0);if (r->>'total')::integer<>0 then raise exception 'History isolation failed';end if;
 begin perform public.admin_manage(current_setting('qa.admin')::uuid,'suspend_account');raise exception 'Admin protection failed';
 exception when raise_exception then if sqlerrm<>'No se pueden modificar administradores' then raise;end if;end;
end $$;
reset role;
insert into public.trips(passenger_id,origin,destination,status) values(current_setting('qa.person')::uuid,'QA recogida','QA destino','searching');
set local role authenticated;
do $$begin
 begin perform public.admin_manage(current_setting('qa.person')::uuid,'approve_driver');raise exception 'Active trip guard failed';
 exception when raise_exception then if sqlerrm<>'Esta cuenta tiene un viaje activo' then raise;end if;end;
end $$;
rollback;
