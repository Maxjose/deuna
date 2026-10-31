-- Interruptor y horario de la verificación automática. Rollback.
begin;
update private.payment_config set verify_url='https://example.invalid/noop' where id=1;
do $test$
declare passenger uuid:=gen_random_uuid(); driver uuid:=gen_random_uuid(); admin uuid:=gen_random_uuid(); trip uuid:=gen_random_uuid();
  key text; rejected boolean; h jsonb;
begin
  insert into auth.users(id) values(passenger),(driver),(admin);
  update public.profiles set role='driver',approved=true where id=driver;
  update public.profiles set role='admin' where id=admin;
  insert into public.trips(id,passenger_id,driver_id,origin,destination,status,fare_cents,payment_method,exchange_rate)
   values(trip,passenger,driver,'A','B','assigned',100,'pago_movil',1000);
  select worker_key into key from private.push_config where id=1;
  -- Horario: igual = todo el día; normal; cruzando medianoche.
  update private.payment_config set enabled=true,auto_start='00:00',auto_end='00:00' where id=1;
  assert private.payment_auto_active('03:00'),'24h';
  update private.payment_config set auto_start='07:00',auto_end='21:00' where id=1;
  assert private.payment_auto_active('07:00') and private.payment_auto_active('20:59') and not private.payment_auto_active('21:00') and not private.payment_auto_active('06:59'),'Day window';
  update private.payment_config set auto_start='20:00',auto_end='02:00' where id=1;
  assert private.payment_auto_active('23:00') and private.payment_auto_active('01:59') and not private.payment_auto_active('12:00'),'Overnight window';
  -- Solo admin configura.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',passenger::text,true);
  rejected:=false; begin perform public.save_payment_automation(false,'00:00','00:00'); exception when raise_exception then rejected:=true; end;
  assert rejected,'Passenger configured';
  -- Desactivada: el pago queda en revisión y el trabajador no reclama nada.
  perform set_config('request.jwt.claim.sub',admin::text,true);
  h:=public.save_payment_automation(false,'00:00','00:00');
  assert (h->>'enabled')='false' and (h->>'active')='false','Disabled saved';
  perform set_config('request.jwt.claim.sub',passenger::text,true);
  assert (public.report_payment(trip,'123456','0102','04141234567',1000)->>'status')='review','Disabled goes to review';
  reset role;
  assert (select payment_note from public.trips where id=trip)='Verificación automática desactivada','Disabled note';
  update public.trips set payment_status='checking',payment_next_check_at=now() where id=trip;
  set local role anon;
  assert jsonb_array_length(public.payment_worker(key,'claim','{}'))=0,'No claims when disabled';
  reset role;
  -- El cron pasa a revisión lo que quedó esperando.
  perform private.wake_payments();
  assert (select payment_status from public.trips where id=trip)='review','Held to review';
  -- Reintento manual no permitido mientras está desactivada.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',admin::text,true);
  rejected:=false; begin perform public.admin_payment(trip,'retry'); exception when raise_exception then rejected:=sqlerrm='La verificación automática no está activa'; end;
  assert rejected,'Retry blocked';
  -- Activada todo el día: vuelve a verificar.
  h:=public.save_payment_automation(true,'00:00','00:00');
  assert (h->>'active')='true' and (h->>'auto_start')='00:00','Enabled saved';
  perform public.admin_payment(trip,'retry');
  reset role;
  set local role anon;
  assert jsonb_array_length(public.payment_worker(key,'claim','{}'))=1,'Claims when enabled';
  reset role;
  raise notice 'payment-schedule ok';
end
$test$;
rollback;
