-- Binance Pay: confirmación por el trabajador, uso único, monto, bloqueo de inicio, recargas e interruptores. Rollback.
begin;
do $test$
declare a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); trip uuid:=gen_random_uuid(); key text; rejected boolean; r jsonb;
begin
  insert into auth.users(id) values(a),(p),(d);
  update public.profiles set role='admin' where id=a;
  update public.profiles set role='driver',approved=true where id=d;
  select worker_key into key from private.push_config where id=1;
  set local role authenticated; perform set_config('request.jwt.claim.sub',a::text,true);
  rejected:=false; begin perform public.admin_payment_methods(true,true,null); exception when raise_exception then rejected:=sqlerrm='Falta el Pay ID'; end;
  assert rejected,'Pay ID required';
  perform public.admin_payment_methods(false,true,'65038281');
  reset role;
  assert (select binance_enabled and binance_pay_id='65038281' and not pago_movil_enabled from public.service_settings where id=1),'Settings';
  insert into public.trips(id,passenger_id,driver_id,origin,destination,status,fare_cents,payment_method,created_at) values(trip,p,d,'A','B','arrived',350,'binance',now()-interval '5 minutes');
  -- El conductor no inicia sin pago verificado.
  set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
  rejected:=false; begin perform public.operate('advance',jsonb_build_object('id',trip)); exception when raise_exception then rejected:=sqlerrm='Falta pago Binance'; end;
  assert rejected,'Advance without Binance';
  reset role; set local role anon;
  rejected:=false; begin perform public.binance_confirm(repeat('0',64),'{}'); exception when raise_exception then rejected:=sqlerrm='No autorizado'; end;
  assert rejected,'Bad key';
  rejected:=false; begin perform public.binance_confirm(key,jsonb_build_object('kind','trip','user_id',p,'trip_id',trip,'transaction_id','T123456','amount','3.4','currency','USDT','transaction_time',(extract(epoch from now())*1000)::bigint)); exception when raise_exception then rejected:=sqlerrm='Monto insuficiente'; end;
  assert rejected,'Low amount';
  rejected:=false; begin perform public.binance_confirm(key,jsonb_build_object('kind','trip','user_id',p,'trip_id',trip,'transaction_id','T123456','amount','3.5','currency','BTC','transaction_time',(extract(epoch from now())*1000)::bigint)); exception when raise_exception then rejected:=sqlerrm='Pago inválido'; end;
  assert rejected,'Currency';
  rejected:=false; begin perform public.binance_confirm(key,jsonb_build_object('kind','trip','user_id',d,'trip_id',trip,'transaction_id','T123456','amount','3.5','currency','USDT','transaction_time',(extract(epoch from now())*1000)::bigint)); exception when raise_exception then rejected:=sqlerrm='Viaje no encontrado'; end;
  assert rejected,'Other user';
  r:=public.binance_confirm(key,jsonb_build_object('kind','trip','user_id',p,'trip_id',trip,'transaction_id','T123456','amount','3.5','currency','USDT','transaction_time',(extract(epoch from now())*1000)::bigint));
  assert r->>'status'='verified','Verified';
  reset role;
  assert (select payment_status='verified' and binance_tx='T123456' from public.trips where id=trip),'Trip verified';
  set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
  perform public.operate('advance',jsonb_build_object('id',trip));
  reset role; set local role anon;
  -- Recarga: desactivada; luego activa; transacción repetida rechazada.
  rejected:=false; begin perform public.binance_confirm(key,jsonb_build_object('kind','topup','user_id',p,'transaction_id','T999999','amount','10','currency','USDT','transaction_time',(extract(epoch from now())*1000)::bigint)); exception when raise_exception then rejected:=sqlerrm='Recargas no disponibles'; end;
  assert rejected,'Topup disabled';
  reset role; update public.service_settings set wallet_topup_enabled=true where id=1; set local role anon;
  r:=public.binance_confirm(key,jsonb_build_object('kind','topup','user_id',p,'transaction_id','T999999','amount','10.019','currency','USDT','transaction_time',(extract(epoch from now())*1000)::bigint));
  assert (r->>'amount_cents')::int=1001 and (r->>'balance_cents')::int=1001,'Topup '||r::text;
  rejected:=false; begin perform public.binance_confirm(key,jsonb_build_object('kind','topup','user_id',p,'transaction_id','T123456','amount','10','currency','USDT','transaction_time',(extract(epoch from now())*1000)::bigint)); exception when raise_exception then rejected:=sqlerrm='Transacción ya usada'; end;
  assert rejected,'Reuse';
  reset role;
  -- Pago móvil desactivado: no se puede solicitar con pago móvil (insert_quoted_trip valida antes de la firma? se comprueba la función).
  assert position('Pago movil no disponible' in pg_get_functiondef('private.insert_quoted_trip(jsonb)'::regprocedure))>0,'Request check';
  raise notice 'binance-pay ok';
end
$test$;
rollback;
