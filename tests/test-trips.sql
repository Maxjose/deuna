-- Viaje de prueba: sin ingresos, comisión ni saldo pendiente; marcado como prueba. Rollback.
begin;
do $test$
declare p uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); t uuid:=gen_random_uuid(); n text;
begin
  insert into auth.users(id,raw_user_meta_data) values(p,'{}'),(d,'{}');
  update public.profiles set role='driver',approved=true where id=d;
  update public.service_settings set commission_enabled=true, commission_percent=20, commission_on_cash=true where id=1;
  insert into public.trips(id,passenger_id,driver_id,origin,destination,status,fare_cents,payment_method) values(t,p,d,'A','B','ongoing',500,'test');
  select payment_note into n from public.trips where id=t; assert n='Viaje de prueba · sin cobro','Marked';
  update public.trips set status='finished' where id=t;
  assert not exists(select 1 from private.driver_ledger where trip_id=t),'No ledger';
  assert not exists(select 1 from private.debt_trips(p)),'No debt';
  assert position('Viaje de prueba no disponible' in pg_get_functiondef('private.insert_quoted_trip(jsonb)'::regprocedure))>0,'Request guard';
  raise notice 'test-trips ok';
end $test$;
rollback;
