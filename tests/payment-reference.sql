begin;
select set_config('qa.p',gen_random_uuid()::text,true),set_config('qa.d',gen_random_uuid()::text,true),set_config('qa.t',gen_random_uuid()::text,true);
insert into auth.users(id,email) select current_setting(k)::uuid,'reference-'||current_setting(k)||'@example.invalid' from unnest(array['qa.p','qa.d'])k;
update public.profiles set role='driver',approved=true where id=current_setting('qa.d')::uuid;
-- No external bank requests are made by these tests.
update private.payment_config set enabled=false;
insert into public.trips(id,passenger_id,driver_id,origin,destination,status,payment_method,fare_cents,exchange_rate) values(current_setting('qa.t')::uuid,current_setting('qa.p')::uuid,current_setting('qa.d')::uuid,'Reference origin','Reference destination','assigned','pago_movil',100,1);
select set_config('request.jwt.claim.sub',current_setting('qa.p'),true);
set local role authenticated;
select public.report_payment(current_setting('qa.t')::uuid,'0000000123456','0102','04121234567',1);
do $$begin
 if not exists(select 1 from public.trips where id=current_setting('qa.t')::uuid and payment_reference='123456') then raise exception 'Long reference not normalized';end if;
 begin perform public.report_payment(current_setting('qa.t')::uuid,'12345','0102','04121234567',1);raise exception 'Short reference accepted';exception when raise_exception then if sqlerrm<>'Referencia inválida' then raise;end if;end;
end $$;
reset role;
rollback;
