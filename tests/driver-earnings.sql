-- Ganancias de conductores: acreditación por viaje cobrado por la app y pagos de la administración. Rollback.
begin;
do $test$
declare a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); t1 uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid(); r jsonb; rejected boolean;
begin
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(p,'{}'),(d,'{"payout":{"bank":"0102","id_number":"12345678","phone":"04121234567"}}');
  update public.profiles set role='admin' where id=a;
  update public.profiles set role='driver',approved=true where id=d;
  insert into public.trips(id,passenger_id,driver_id,origin,destination,status,fare_cents,payment_method,exchange_rate,payment_reference,payment_status)
   values(t1,p,d,'A','B','ongoing',400,'pago_movil',100,'123456','verified');
  update public.trips set status='finished' where id=t1;
  insert into public.trips(id,passenger_id,driver_id,origin,destination,status,fare_cents,payment_method) values(t2,p,d,'A','C','ongoing',300,'cash');
  update public.trips set status='finished' where id=t2;
  update public.trips set payment_note='x' where id=t1;
  assert private.driver_balance(d)=400,'Only app-paid credited once';
  set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
  r:=public.my_earnings(); assert (r->>'balance_cents')::int=400 and jsonb_array_length(r->'movements')=1 and r->'movements'->0->>'destination'='B','Driver view';
  rejected:=false; begin perform public.admin_driver_payout(d,100,'x',null); exception when raise_exception then rejected:=sqlerrm='No autorizado'; end;
  assert rejected,'Driver self payout';
  perform set_config('request.jwt.claim.sub',a::text,true);
  rejected:=false; begin perform public.admin_driver_payout(d,500,'x',null); exception when raise_exception then rejected:=sqlerrm='Monto mayor al acumulado'; end;
  assert rejected,'Over balance';
  r:=public.admin_driver_payout(d,250,'Ref 778899','Pago semanal');
  assert (r->>'balance_cents')::int=150 and (r->>'paid_cents')::int=250 and (r->>'earned_cents')::int=400 and r->'payout_account'->>'bank'='0102','Payout '||r::text;
  reset role;
  raise notice 'driver-earnings ok';
end
$test$;
rollback;
