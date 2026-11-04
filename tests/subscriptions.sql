-- Suscripción de conductores: datos de la moto, prueba gratis única, bloqueo, pagos y reglas del viaje. Rollback.
begin;
do $test$
declare a uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); d2 uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); key text; st jsonb; rejected boolean; j jsonb; job jsonb; t uuid:=gen_random_uuid();
begin
  insert into auth.users(id) values(a),(d),(d2),(p);
  update public.profiles set role='admin' where id=a;
  update public.profiles set role='driver' where id in (d,d2);
  select worker_key into key from private.push_config where id=1;
  -- Aprobación exige moto y pago móvil.
  rejected:=false; begin update public.profiles set approved=true where id=d; exception when raise_exception then rejected:=sqlerrm='Faltan datos del conductor'; end;
  assert rejected,'Approval requires data';
  set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
  perform public.save_my_vehicle('ab-123 cd','Bera SBR','Rojo');
  perform public.save_my_payout('0102','V-12.345.678','0412-1234567');
  perform set_config('request.jwt.claim.sub',d2::text,true);
  rejected:=false; begin perform public.save_my_vehicle('AB123CD','Empire','Negro'); exception when raise_exception then rejected:=sqlerrm='Placa ya registrada'; end;
  assert rejected,'Unique plate';
  rejected:=false; begin perform public.save_my_payout('0105','12345678','04141112222'); exception when raise_exception then rejected:=sqlerrm='Cédula ya registrada'; end;
  assert rejected,'Unique cedula';
  reset role;
  update public.profiles set approved=true where id=d;
  -- Modo suscripción y prueba gratis.
  set local role authenticated; perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.admin_subscription_settings('{"billing_mode":"subscription","whatsapp":"0412-6655273"}');
  perform set_config('request.jwt.claim.sub',d::text,true);
  st:=public.my_plan('device-1'); assert st->>'status' in ('active','expiring') and (st->>'trial_used')::boolean,'Trial granted '||st::text;
  st:=public.my_plan('device-1'); assert jsonb_array_length(st->'payments')=1,'Trial once';
  -- Conectarse permitido; vencido + gracia: bloqueado.
  perform public.operate('available','{"available":true}');
  reset role; update private.driver_subscriptions set paid_until=now()-interval '25 hours' where driver_id=d;
  set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
  rejected:=false; begin perform public.operate('available','{"available":true}'); exception when raise_exception then rejected:=sqlerrm='Plan vencido'; end;
  assert rejected,'Blocked after grace';
  -- Pago móvil del plan → verificador → aprobado y extendido 7 días.
  reset role; update public.service_settings set pago_movil_bank='0102',pago_movil_phone='04140000000',pago_movil_id='V12345678',exchange_rate=100 where id=1;
  set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
  j:=public.request_plan_payment('week','Ref 0099112233','0105','0412-9998877');
  reset role; set local role anon;
  j:=public.payment_worker(key,'claim','{}'); job:=j->0;
  assert job->>'amount'='600,00' and job->>'reference'='112233','Plan job '||j::text;
  perform public.payment_worker(key,'finish',jsonb_build_object('trip_id',job->>'trip_id','lease',job->>'lease','outcome','verified','message','ok'));
  reset role;
  assert (select paid_until > now()+interval '6 days' from private.driver_subscriptions where driver_id=d),'Extended';
  -- Otro conductor con la misma placa/cédula no puede (ya garantizado). Prueba atada al dispositivo:
  reset role;
  insert into private.driver_vehicles(driver_id,plate,model,color) values(d2,'XY999ZZ','Otra','Azul');
  insert into private.driver_payout(driver_id,bank,id_number,phone) values(d2,'0105','87654321','04145556666');
  update public.profiles set approved=true where id=d2;
  set local role authenticated; perform set_config('request.jwt.claim.sub',d2::text,true);
  st:=public.my_plan('device-1'); assert st->>'status'='none' and (st->>'trial_used')::boolean,'Same device no trial '||st::text;
  -- Pasajero: en suscripción solo efectivo/pago móvil y el viaje guarda su modelo; pago móvil no exige referencia para iniciar.
  reset role;
  insert into public.trips(id,passenger_id,driver_id,origin,destination,status,fare_cents,payment_method,exchange_rate) values(t,p,d,'A','B','arrived',300,'pago_movil',100);
  assert (select billing_mode from public.trips where id=t)='subscription','Trip mode';
  set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
  perform public.operate('advance',jsonb_build_object('id',t));
  perform set_config('request.jwt.claim.sub',p::text,true);
  st:=public.trip_person(t); assert st->'vehicle'->>'plate'='AB123CD' and st->'payout'->>'id_number'='12345678','Passenger sees vehicle/payout '||st::text;
  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  update public.trips set status='finished' where id=t;
  assert not exists(select 1 from private.driver_ledger where trip_id=t),'No earnings in subscription';
  -- Admin: overview, extender y revisar.
  set local role authenticated; perform set_config('request.jwt.claim.sub',a::text,true);
  st:=public.admin_plan_overview(); assert st->'drivers'->d::text->>'status' in ('active','expiring') and (st->>'collected_30d_cents')::int=600,'Overview '||st::text;
  st:=public.admin_plan_extend(d2,30,2000,'Pago por WhatsApp'); assert st->>'status'='active','Admin extend';
  reset role;
  raise notice 'subscriptions ok';
end
$test$;
rollback;
