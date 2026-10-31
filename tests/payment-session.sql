-- Sesión única de verificación, ventana y reintentos escalonados. Rollback.
begin;
update private.payment_config set verify_url='https://example.invalid/noop', enabled=true, auto_start='00:00', auto_end='00:00', run_id=null, run_until=null where id=1;
do $test$
declare passenger uuid:=gen_random_uuid(); driver uuid:=gen_random_uuid(); trip uuid:=gen_random_uuid();
  key text; run1 jsonb; run2 jsonb; job jsonb; t public.trips;
begin
  insert into auth.users(id) values(passenger),(driver);
  update public.profiles set role='driver',approved=true where id=driver;
  insert into public.trips(id,passenger_id,driver_id,origin,destination,status,fare_cents,payment_method,exchange_rate,payment_reference,payment_bank,payment_phone,payment_amount_bs,payment_status,payment_next_check_at)
   values(trip,passenger,driver,'A','B','assigned',100,'pago_movil',1000,'123456','0102','04141234567',1000,'checking',now());
  select worker_key into key from private.push_config where id=1;
  set local role anon;
  -- Solo una sesión a la vez.
  run1:=public.payment_worker(key,'start','{}');
  assert run1->>'run' is not null,'First run';
  run2:=public.payment_worker(key,'start','{}');
  assert run2->>'run' is null,'Second run blocked';
  -- Sin turno o con turno ajeno no se reclama nada mientras hay sesión.
  assert jsonb_array_length(public.payment_worker(key,'claim','{}'))=0,'Legacy claim blocked during run';
  assert jsonb_array_length(public.payment_worker(key,'claim',jsonb_build_object('run',gen_random_uuid())))=0,'Foreign run blocked';
  job:=public.payment_worker(key,'claim',jsonb_build_object('run',run1->>'run'))->0;
  assert job->>'trip_id'=trip::text,'Run claims';
  -- No encontrado: reintento a los 30 s (primeros 5), luego cada 2 min.
  perform public.payment_worker(key,'finish',jsonb_build_object('trip_id',trip,'lease',job->>'lease','outcome','not_found'));
  reset role;
  select * into t from public.trips where id=trip;
  assert t.payment_next_check_at between now()+interval '25 seconds' and now()+interval '35 seconds','30s retry';
  update public.trips set payment_attempts=5,payment_next_check_at=now() where id=trip;
  set local role anon;
  assert (public.payment_worker(key,'next_due','{}')->>'next_due') is not null,'Next due';
  job:=public.payment_worker(key,'claim',jsonb_build_object('run',run1->>'run'))->0;
  perform public.payment_worker(key,'finish',jsonb_build_object('trip_id',trip,'lease',job->>'lease','outcome','not_found'));
  reset role;
  select * into t from public.trips where id=trip;
  assert t.payment_next_check_at > now()+interval '100 seconds','2 min retry';
  -- Mientras la sesión está abierta, el aviso de pagos nuevos no abre otra.
  update public.trips set payment_next_check_at=now() where id=trip;
  perform private.wake_payments();
  -- Al terminar, se libera el turno.
  set local role anon;
  perform public.payment_worker(key,'end',jsonb_build_object('run',run1->>'run'));
  assert public.payment_worker(key,'start','{}')->>'run' is not null,'Run released';
  reset role;
  -- Desactivada: no hay turno.
  update private.payment_config set run_id=null,run_until=null,enabled=false where id=1;
  set local role anon;
  assert public.payment_worker(key,'start','{}')->>'run' is null,'No run when disabled';
  reset role;
  raise notice 'payment-session ok';
end
$test$;
rollback;
