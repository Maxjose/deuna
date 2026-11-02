-- Saldo pendiente y referencia obligatoria para iniciar viajes con pago móvil. Rollback.
begin;
do $test$
declare p uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); trip uuid:=gen_random_uuid(); old uuid:=gen_random_uuid(); rejected boolean; b jsonb;
begin
  insert into auth.users(id) values(p),(d);
  update public.profiles set role='driver',approved=true,available=true where id=d;
  insert into public.trips(id,passenger_id,driver_id,origin,destination,status,fare_cents,payment_method,exchange_rate)
   values(trip,p,d,'A','B','arrived',300,'pago_movil',100);
  set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
  rejected:=false; begin perform public.operate('advance',jsonb_build_object('id',trip)); exception when raise_exception then rejected:=sqlerrm='Falta referencia de pago'; end;
  assert rejected,'Driver started without reference';
  reset role; update public.trips set payment_reference='123456',payment_reported_at=now(),payment_status='checking' where id=trip;
  set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
  perform public.operate('advance',jsonb_build_object('id',trip));
  perform public.operate('advance',jsonb_build_object('id',trip));
  reset role; assert (select status from public.trips where id=trip)='finished','Should finish';
  -- Recién terminado y verificando: aún sin saldo pendiente.
  set local role authenticated; perform set_config('request.jwt.claim.sub',p::text,true);
  assert (public.my_balance()->>'amount_cents')::int=0,'No debt yet';
  -- Pasado el margen: saldo pendiente.
  reset role; update public.trips set created_at=now()-interval '2 hours' where id=trip;
  set local role authenticated; perform set_config('request.jwt.claim.sub',p::text,true);
  b:=public.my_balance(); assert (b->>'amount_cents')::int=300 and b->'trips'->>0=trip::text,'Debt '||b::text;
  -- Rechazado: deuda inmediata; verificado: sin deuda.
  reset role; update public.trips set created_at=now(),payment_status='rejected' where id=trip;
  set local role authenticated; assert (public.my_balance()->>'amount_cents')::int=300,'Rejected debt';
  reset role; update public.trips set payment_status='verified' where id=trip;
  set local role authenticated; assert (public.my_balance()->>'amount_cents')::int=0,'Verified clears';
  reset role;
  raise notice 'pending-balance ok';
end
$test$;
rollback;
