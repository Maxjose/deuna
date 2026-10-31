begin;
select set_config('qa.admin',gen_random_uuid()::text,true),set_config('qa.passenger',gen_random_uuid()::text,true);
insert into auth.users(id,email) select current_setting(k)::uuid,'rounding-'||current_setting(k)||'@example.invalid' from unnest(array['qa.admin','qa.passenger'])k;
update public.profiles set role='admin' where id=current_setting('qa.admin')::uuid;
select set_config('request.jwt.claim.sub',current_setting('qa.passenger'),true);
set local role authenticated;
do $$begin
 begin perform public.operate('fares','{"base_cents":100,"per_km_cents":50,"minimum_cents":100,"rounding_cents":100}');raise exception 'Passenger changed fares';exception when raise_exception then if sqlerrm<>'No autorizado' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.admin'),true);
select public.operate('fares','{"base_cents":100,"per_km_cents":50,"minimum_cents":100,"rounding_cents":50}');
do $$begin
 if (select rounding_cents from public.service_settings where id=1)<>50 then raise exception 'Rounding not saved';end if;
 begin perform public.operate('fares','{"base_cents":100,"per_km_cents":50,"minimum_cents":100,"rounding_cents":25}');raise exception 'Invalid rounding accepted';exception when check_violation then null;end;
end $$;
reset role;
rollback;
