-- Verificación de pago móvil: informe, trabajador, reintentos, reutilización y administración. Rollback.
begin;
do $test$
declare passenger uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); driver uuid:=gen_random_uuid(); admin uuid:=gen_random_uuid();
  trip uuid:=gen_random_uuid(); trip2 uuid:=gen_random_uuid(); key text; jobs jsonb; job jsonb; rejected boolean; t public.trips;
begin
  insert into auth.users(id) values(passenger),(other),(driver),(admin);
  update public.profiles set role='driver',approved=true where id=driver;
  update public.profiles set role='admin' where id=admin;
  insert into public.trips(id,passenger_id,driver_id,origin,destination,status,fare_cents,payment_method,exchange_rate)
   values(trip,passenger,driver,'A','B','assigned',368,'pago_movil',1000),(trip2,other,driver,'A','B','finished',100,'pago_movil',1000);
  select worker_key into key from private.push_config where id=1;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',passenger::text,true);
  -- Monto fuera de tolerancia (esperado Bs. 3680,00; tolerancia Bs. 36,80).
  rejected:=false; begin perform public.report_payment(trip,'0012404621','0163','0412-1234567',3600); exception when raise_exception then rejected:=sqlerrm='El monto no coincide con el del viaje'; end;
  assert rejected,'Amount tolerance';
  rejected:=false; begin perform public.report_payment(trip,'404621','163','04121234567',3680); exception when raise_exception then rejected:=sqlerrm='Banco inválido'; end;
  assert rejected,'Bank validation';
  -- Dentro de tolerancia: queda verificando.
  assert (public.report_payment(trip,'0012404621','0163','0412-1234567',3680.5)->>'status')='checking','Should be checking';
  reset role;
  select * into t from public.trips where id=trip;
  assert t.payment_bank='0163' and t.payment_phone='04121234567' and t.payment_amount_bs=3680.50 and t.payment_attempts=0,'Stored payment';
  -- Otra persona no puede reutilizar la misma referencia.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',other::text,true);
  rejected:=false; begin perform public.report_payment(trip2,'404621','0163','04140000000',1000); exception when raise_exception then rejected:=sqlerrm='Esta referencia ya fue usada en otro viaje'; end;
  assert rejected,'Reference reuse';
  -- Sin banco/teléfono (app antigua): revisión manual.
  assert (public.report_payment(trip2,'777777')->>'status')='review','Old client goes to review';
  reset role;
  -- Trabajador: clave incorrecta rechazada; reclama el trabajo con los datos para el banco.
  set local role anon;
  rejected:=false; begin perform public.payment_worker(repeat('0',64),'claim','{}'); exception when raise_exception then rejected:=true; end;
  assert rejected,'Bad worker key';
  jobs:=public.payment_worker(key,'claim','{}');
  assert jsonb_array_length(jobs)=1,'One job';
  job:=jobs->0;
  assert job->>'reference'='404621' and job->>'bank'='0163' and job->>'phone'='04121234567' and job->>'amount'='3680,50','Job payload';
  -- Bloqueado mientras se procesa: no se reclama dos veces.
  assert jsonb_array_length(public.payment_worker(key,'claim','{}'))=0,'Locked job';
  -- No encontrado: reintento en 1 minuto.
  perform public.payment_worker(key,'finish',jsonb_build_object('trip_id',trip,'lease',job->>'lease','outcome','not_found','message','Pago Movil No encontrado'));
  reset role;
  select * into t from public.trips where id=trip;
  assert t.payment_status='checking' and t.payment_attempts=1 and t.payment_next_check_at>now(),'Retry scheduled';
  -- Lease antiguo no sirve.
  set local role anon;
  assert (public.payment_worker(key,'finish',jsonb_build_object('trip_id',trip,'lease',job->>'lease','outcome','verified'))->>'saved')='false','Stale lease';
  reset role;
  update public.trips set payment_next_check_at=now()-interval '1 second' where id=trip;
  set local role anon;
  job:=public.payment_worker(key,'claim','{}')->0;
  perform public.payment_worker(key,'finish',jsonb_build_object('trip_id',trip,'lease',job->>'lease','outcome','verified','message','Pago verificado'));
  reset role;
  select * into t from public.trips where id=trip;
  assert t.payment_status='verified' and t.payment_verified_by='auto' and t.payment_verified_at is not null,'Verified';
  -- Verificado: el pasajero ya no puede cambiarlo.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',passenger::text,true);
  rejected:=false; begin perform public.report_payment(trip,'111111','0163','04121234567',3680); exception when raise_exception then rejected:=sqlerrm='Este pago ya fue verificado'; end;
  assert rejected,'Verified locked';
  -- Tras agotar intentos: revisión.
  reset role;
  update public.trips set payment_status='checking',payment_attempts=14,payment_next_check_at=now()-interval '1 second',payment_bank='0102',payment_phone='04140000000',payment_amount_bs=1000 where id=trip2;
  set local role anon;
  job:=public.payment_worker(key,'claim','{}')->0;
  perform public.payment_worker(key,'finish',jsonb_build_object('trip_id',trip2,'lease',job->>'lease','outcome','not_found','message','Pago Movil No encontrado'));
  reset role;
  assert (select payment_status from public.trips where id=trip2)='review','Exhausted to review';
  -- Administración: solo admin aprueba o rechaza; ve el estado de la conexión.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',passenger::text,true);
  rejected:=false; begin perform public.admin_payment(trip2,'approve'); exception when raise_exception then rejected:=true; end;
  assert rejected,'Passenger approved';
  rejected:=false; begin perform public.payment_health(); exception when raise_exception then rejected:=true; end;
  assert rejected,'Passenger health';
  perform set_config('request.jwt.claim.sub',admin::text,true);
  perform public.admin_payment(trip2,'retry');
  assert (select payment_status from public.trips where id=trip2)='checking','Admin retry';
  perform public.admin_payment(trip2,'approve','Visto en el banco');
  assert (select payment_status='verified' and payment_verified_by='admin' from public.trips where id=trip2),'Admin approve';
  perform public.admin_payment(trip2,'reject');
  assert (select payment_status from public.trips where id=trip2)='rejected','Admin reject';
  reset role;
  set local role anon;
  perform public.payment_worker(key,'health','{"ok":true,"message":"Conectado"}');
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',admin::text,true);
  assert (public.payment_health()->>'last_ok')='true','Health stored';
  reset role;
  raise notice 'payment-verification ok';
end
$test$;
rollback;
