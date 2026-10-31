-- Métodos de pago: configuración, solicitud con efectivo o pago móvil y referencia. Transacción con rollback.
begin;
do $test$
declare passenger uuid:=gen_random_uuid(); driver uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); admin uuid:=gen_random_uuid();
  secret text; rejected boolean; t public.trips; cash_trip uuid; pm_trip uuid;
  function_quote jsonb;
begin
  insert into auth.users(id) values(passenger),(driver),(other),(admin);
  update public.profiles set role='driver',approved=true where id=driver;
  update public.profiles set role='admin' where id=admin;
  update public.service_settings set enabled=true,open_time='00:00',close_time='00:00',pago_movil_bank=null,pago_movil_phone=null,pago_movil_id=null,exchange_rate=null where id=1;
  select k.secret into secret from private.fare_key k where id=1;

  -- Solo la administración guarda los datos de pago móvil.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',passenger::text,true);
  rejected:=false; begin perform public.save_payment_settings('Banco QA','0414-1234567','V-12.345.678',40.5); exception when raise_exception then rejected:=true; end;
  assert rejected,'Passenger saved payment settings';
  rejected:=false; begin update public.service_settings set exchange_rate=1 where id=1; exception when insufficient_privilege then rejected:=true; end;
  assert rejected,'Direct settings write allowed';

  -- Pago móvil sin configurar: rechazado.
  function_quote:=jsonb_build_object('id',gen_random_uuid(),'user_id',passenger,'origin','A','destination','B','distance_meters',5000,'duration_seconds',600,'fare_cents',350,'currency','USD','expires_at',floor(extract(epoch from now()))+300);
  rejected:=false; begin perform public.operate('request',jsonb_build_object('quote',function_quote::text,'signature',encode(extensions.hmac(function_quote::text,secret,'sha256'),'hex'),'payment_method','pago_movil')); exception when raise_exception then rejected:=sqlerrm='Pago movil no disponible'; end;
  assert rejected,'Unconfigured pago movil accepted';
  -- Método inválido: rechazado.
  rejected:=false; begin perform public.operate('request',jsonb_build_object('quote',function_quote::text,'signature',encode(extensions.hmac(function_quote::text,secret,'sha256'),'hex'),'payment_method','cripto')); exception when raise_exception then rejected:=true; end;
  assert rejected,'Invalid method accepted';
  -- Sin método: efectivo por defecto (compatibilidad con la versión anterior de la app).
  perform public.operate('request',jsonb_build_object('quote',function_quote::text,'signature',encode(extensions.hmac(function_quote::text,secret,'sha256'),'hex')));
  select * into strict t from public.trips where passenger_id=passenger and status='searching';
  assert t.payment_method='cash' and t.exchange_rate is null,'Default should be cash';
  cash_trip:=t.id;
  -- Efectivo no admite referencia.
  rejected:=false; begin perform public.report_payment(cash_trip,'123456'); exception when raise_exception then rejected:=true; end;
  assert rejected,'Cash trip accepted reference';
  perform public.operate('cancel',jsonb_build_object('id',cash_trip));

  -- La administración configura; se normalizan teléfono y cédula.
  perform set_config('request.jwt.claim.sub',admin::text,true);
  perform public.save_payment_settings(' Banco QA ','0414-123.45.67','v-12.345.678',40.5);
  reset role;
  assert (select pago_movil_bank='Banco QA' and pago_movil_phone='04141234567' and pago_movil_id='V12345678' and exchange_rate=40.5 and exchange_rate_updated_at is not null from public.service_settings where id=1),'Settings not normalized';
  set local role authenticated;
  rejected:=false; begin perform public.save_payment_settings('Banco QA','123','V1',40.5); exception when check_violation then rejected:=true; end;
  assert rejected,'Invalid phone accepted';

  -- Pago móvil: guarda la tasa del momento.
  perform set_config('request.jwt.claim.sub',passenger::text,true);
  function_quote:=jsonb_build_object('id',gen_random_uuid(),'user_id',passenger,'origin','A','destination','B','distance_meters',5000,'duration_seconds',600,'fare_cents',350,'currency','USD','expires_at',floor(extract(epoch from now()))+300);
  perform public.operate('request',jsonb_build_object('quote',function_quote::text,'signature',encode(extensions.hmac(function_quote::text,secret,'sha256'),'hex'),'payment_method','pago_movil'));
  select * into strict t from public.trips where passenger_id=passenger and status='searching';
  assert t.payment_method='pago_movil' and t.exchange_rate=40.5,'Rate not stored';
  pm_trip:=t.id;
  -- Antes de que acepten, no se admite referencia.
  rejected:=false; begin perform public.report_payment(pm_trip,'123456'); exception when raise_exception then rejected:=sqlerrm='Espera a que un motorizado acepte el viaje'; end;
  assert rejected,'Reference accepted while searching';
  -- Cambiar la tasa después no altera el viaje.
  perform set_config('request.jwt.claim.sub',admin::text,true);
  perform public.save_payment_settings('Banco QA','04141234567','V12345678',99);
  reset role;
  update public.trips set driver_id=driver,status='assigned' where id=pm_trip;
  set local role authenticated;
  assert (select exchange_rate from public.trips where id=pm_trip)=40.5,'Trip rate changed';

  -- Otro usuario no puede informar la referencia.
  perform set_config('request.jwt.claim.sub',other::text,true);
  rejected:=false; begin perform public.report_payment(pm_trip,'123456'); exception when raise_exception then rejected:=true; end;
  assert rejected,'Outsider reported payment';
  -- El pasajero informa (se limpian espacios y guiones) y puede corregir.
  perform set_config('request.jwt.claim.sub',passenger::text,true);
  rejected:=false; begin perform public.report_payment(pm_trip,'12'); exception when raise_exception then rejected:=sqlerrm='Referencia inválida'; end;
  assert rejected,'Short reference accepted';
  perform public.report_payment(pm_trip,' 0012-3456 ');
  assert (select payment_reference='00123456' and payment_reported_at is not null from public.trips where id=pm_trip),'Reference not saved';
  perform public.report_payment(pm_trip,'987654');
  assert (select payment_reference from public.trips where id=pm_trip)='987654','Reference not corrected';
  -- El motorizado ve el método y la referencia.
  perform set_config('request.jwt.claim.sub',driver::text,true);
  assert (select payment_method='pago_movil' and payment_reference='987654' from public.trips where id=pm_trip),'Driver cannot read payment';
  rejected:=false; begin update public.trips set payment_reference='1111' where id=pm_trip; exception when insufficient_privilege then rejected:=true; end;
  assert rejected,'Direct trip write allowed';
  reset role;
  raise notice 'trip-payments ok';
end
$test$;
rollback;
