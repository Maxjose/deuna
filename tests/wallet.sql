-- Saldo de cuenta: abonos, pago con saldo, reembolso por cancelación, saldo pendiente y recargas. Rollback.
begin;
do $test$
declare a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); t1 uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid(); rejected boolean; w jsonb; tp jsonb;
begin
  insert into auth.users(id) values(a),(p),(d);
  update public.profiles set role='admin' where id=a;
  update public.profiles set role='driver',approved=true where id=d;
  set local role authenticated;
  -- Solo admin abona; no puede dejar saldo negativo.
  perform set_config('request.jwt.claim.sub',p::text,true);
  rejected:=false; begin perform public.admin_wallet_adjust(p,500,'x'); exception when raise_exception then rejected:=sqlerrm='No autorizado'; end;
  assert rejected,'Passenger self-credit';
  perform set_config('request.jwt.claim.sub',a::text,true);
  assert (public.admin_wallet_adjust(p,500,'Bono')->>'balance_cents')::int=500,'Credit';
  rejected:=false; begin perform public.admin_wallet_adjust(p,-600,null); exception when raise_exception then rejected:=sqlerrm='Saldo insuficiente'; end;
  assert rejected,'Negative balance';
  reset role;
  -- Pago con saldo al crear el viaje.
  insert into public.trips(id,passenger_id,origin,destination,status,fare_cents,payment_method) values(t1,p,'A','B','searching',300,'wallet');
  assert (select payment_status='verified' and payment_verified_by='wallet' from public.trips where id=t1),'Wallet trip paid';
  assert private.wallet_balance(p)=200,'Debited';
  rejected:=false; begin insert into public.trips(id,passenger_id,origin,destination,status,fare_cents,payment_method) values(gen_random_uuid(),p,'A','B','searching',300,'wallet'); exception when raise_exception then rejected:=sqlerrm='Saldo insuficiente'; end;
  assert rejected,'Insufficient';
  -- Cancelado: reembolso una sola vez.
  update public.trips set status='cancelled' where id=t1;
  update public.trips set payment_note='x' where id=t1;
  assert private.wallet_balance(p)=500,'Refund once '||private.wallet_balance(p);
  -- Pago móvil verificado y cancelado: reembolso.
  insert into public.trips(id,passenger_id,driver_id,origin,destination,status,fare_cents,payment_method,exchange_rate,payment_reference,payment_status) values(t2,p,d,'A','B','assigned',250,'pago_movil',100,'123456','verified');
  update public.trips set status='cancelled' where id=t2;
  assert private.wallet_balance(p)=750,'Pago movil refund';
  -- Saldo pendiente pagado con saldo.
  update public.trips set status='finished',payment_status='rejected' where id=t2;
  set local role authenticated; perform set_config('request.jwt.claim.sub',p::text,true);
  assert (public.my_balance()->>'amount_cents')::int=250,'Debt';
  assert (public.wallet_settle_trip(t2)->>'balance_cents')::int=500,'Settle';
  assert (public.my_balance()->>'amount_cents')::int=0,'Debt cleared';
  w:=public.my_wallet(); assert (w->>'balance_cents')::int=500 and jsonb_array_length(w->'movements')=5 and (w->>'topup_enabled')::boolean=false,'My wallet '||w::text;
  -- Recargas desactivadas por defecto.
  rejected:=false; begin perform public.wallet_request_topup(1000,'654321','0102','04141234567'); exception when raise_exception then rejected:=sqlerrm='Recargas no disponibles'; end;
  assert rejected,'Topup disabled';
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.admin_wallet_settings(true);
  perform set_config('request.jwt.claim.sub',p::text,true);
  perform public.wallet_request_topup(1000,'Ref 0001654321','0102','0414-1234567');
  rejected:=false; begin perform public.wallet_request_topup(1000,'654321','0102','04141234567'); exception when raise_exception then rejected:=sqlerrm='Esta referencia ya fue usada'; end;
  assert rejected,'Topup reuse';
  perform set_config('request.jwt.claim.sub',a::text,true);
  tp:=public.admin_topups(); assert jsonb_array_length(tp)=1,'Pending topup';
  perform public.admin_review_topup((tp->0->>'id')::uuid,true);
  assert (public.admin_wallet(p)->>'balance_cents')::int=1500,'Topup credited';
  rejected:=false; begin perform public.admin_review_topup((tp->0->>'id')::uuid,true); exception when raise_exception then rejected:=sqlerrm='Recarga no encontrada'; end;
  assert rejected,'Double approve';
  reset role;
  raise notice 'wallet ok';
end
$test$;
rollback;
