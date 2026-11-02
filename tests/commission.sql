-- Comisión De1na sobre viajes cobrados por la app y, opcionalmente, en efectivo. Rollback.
begin;
do $test$
declare a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); t1 uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid(); r jsonb; rejected boolean;
begin
  insert into auth.users(id) values(a),(p),(d);
  update public.profiles set role='admin' where id=a;
  update public.profiles set role='driver',approved=true where id=d;
  set local role authenticated; perform set_config('request.jwt.claim.sub',a::text,true);
  rejected:=false; begin perform public.admin_commission(150,false); exception when raise_exception then rejected:=sqlerrm='Porcentaje inválido'; end;
  assert rejected,'Bad percent';
  perform public.admin_commission(15,true);
  reset role;
  insert into public.trips(id,passenger_id,driver_id,origin,destination,status,fare_cents,payment_method,exchange_rate,payment_reference,payment_status)
   values(t1,p,d,'A','B','ongoing',400,'pago_movil',100,'123456','verified');
  update public.trips set status='finished' where id=t1;
  insert into public.trips(id,passenger_id,driver_id,origin,destination,status,fare_cents,payment_method) values(t2,p,d,'A','C','ongoing',300,'cash');
  update public.trips set status='finished' where id=t2;
  update public.trips set payment_note='x' where id=t2;
  -- 400 - 60 = 340 acreditado; efectivo: -45 de comisión.
  assert private.driver_balance(d)=295,'Balance '||private.driver_balance(d);
  set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
  r:=public.my_earnings(); assert (r->>'commission_cents')::int=105 and (r->>'earned_cents')::int=340,'Earnings '||r::text;
  reset role;
  raise notice 'commission ok';
end
$test$;
rollback;
