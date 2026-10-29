-- Prueba transaccional: todos los usuarios y viajes se revierten al terminar.
begin;
select set_config('test.passenger',gen_random_uuid()::text,true),set_config('test.other',gen_random_uuid()::text,true),set_config('test.driver',gen_random_uuid()::text,true),set_config('test.driver2',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('test.passenger')::uuid),(current_setting('test.other')::uuid),(current_setting('test.driver')::uuid),(current_setting('test.driver2')::uuid);
update public.profiles set role='driver',approved=true,available=true where id in (current_setting('test.driver')::uuid,current_setting('test.driver2')::uuid);
update public.service_settings set enabled=true,open_time='00:00',close_time='00:00';
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.passenger'),true);
do $$begin
 if (select count(*) from public.profiles)<>1 then raise exception 'RLS de perfiles incorrecta';end if;
 begin update public.profiles set role='admin';raise exception 'Escalada de rol permitida';exception when insufficient_privilege then null;end;
 perform public.operate('request','{"origin":"Plaza de prueba","destination":"Mercado de prueba","zone":"San Rafael de El Moján"}');
 perform set_config('test.trip',(select id::text from public.trips limit 1),true);
 begin perform public.operate('request','{"origin":"A","destination":"B","zone":"San Rafael de El Moján"}');raise exception 'Duplicado permitido';exception when unique_violation then null;end;
 begin perform public.operate('settings','{"enabled":true}');raise exception 'Admin permitido';exception when raise_exception then if sqlerrm='Admin permitido' then raise;end if;end;
end$$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$begin if exists(select from public.trips) then raise exception 'Fuga de viajes ajenos';end if;end$$;
select set_config('request.jwt.claim.sub',current_setting('test.driver'),true);
select public.operate('accept',jsonb_build_object('id',current_setting('test.trip')));
select set_config('request.jwt.claim.sub',current_setting('test.driver2'),true);
do $$begin
 begin perform public.operate('accept',jsonb_build_object('id',current_setting('test.trip')));raise exception 'Doble aceptación permitida';exception when raise_exception then if sqlerrm='Doble aceptación permitida' then raise;end if;end;
 begin perform public.operate('advance',jsonb_build_object('id',current_setting('test.trip')));raise exception 'Conductor ajeno permitido';exception when raise_exception then if sqlerrm='Conductor ajeno permitido' then raise;end if;end;
end$$;
select set_config('request.jwt.claim.sub',current_setting('test.driver'),true);
select public.operate('advance',jsonb_build_object('id',current_setting('test.trip')));
select public.operate('advance',jsonb_build_object('id',current_setting('test.trip')));
select public.operate('advance',jsonb_build_object('id',current_setting('test.trip')));
do $$begin if (select status from public.trips where id=current_setting('test.trip')::uuid)<>'finished' then raise exception 'No finalizó';end if;end$$;
reset role;
set local role anon;
do $$begin
 begin perform * from public.trips;raise exception 'Acceso anónimo permitido';exception when insufficient_privilege then null;end;
 begin perform public.operate('request','{}');raise exception 'RPC anónima permitida';exception when insufficient_privilege then null;end;
end$$;
rollback;
select 'Permisos, aislamiento, doble aceptación y flujo completo: OK; datos revertidos' as resultado;
