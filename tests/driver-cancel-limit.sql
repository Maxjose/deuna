-- Límite de cancelaciones del conductor. Rollback.
begin;
do $test$
declare p uuid; d uuid:=gen_random_uuid(); t uuid; i int; rejected boolean; st jsonb;
begin
  insert into auth.users(id) values(d); update public.profiles set role='driver',approved=true where id=d;
  for i in 1..3 loop
    p:=gen_random_uuid(); t:=gen_random_uuid();
    insert into auth.users(id) values(p);
    insert into public.trips(id,passenger_id,driver_id,origin,destination,status) values(t,p,d,'A','B','arrived');
    set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
    if i<3 then
      perform public.operate('request_cancel',jsonb_build_object('id',t));
      perform set_config('request.jwt.claim.sub',p::text,true);
      perform public.operate('respond_cancel',jsonb_build_object('id',t,'approved',true));
      reset role;
      assert (select cancelled_by='driver' and cancelled_stage='arrived' and cancelled_at is not null from public.trips where id=t),'Marked';
    else
      rejected:=false; begin perform public.operate('request_cancel',jsonb_build_object('id',t)); exception when raise_exception then rejected:=sqlerrm='Límite de cancelaciones'; end;
      assert rejected,'Third cancel blocked';
      st:=public.my_cancel_state(); assert (st->>'used')::int=2 and st->>'blocked_until' is not null,'State '||st::text;
      reset role;
    end if;
  end loop;
  -- Pasado el plazo vuelve a poder cancelar.
  update public.trips set cancelled_at=now()-interval '5 hours' where driver_id=d and status='cancelled';
  set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
  perform public.operate('request_cancel',jsonb_build_object('id',t));
  reset role;
  assert (select cancel_requested from public.trips where id=t),'Allowed after window';
  -- Cancelación del pasajero no cuenta para el conductor.
  raise notice 'driver-cancel-limit ok';
end
$test$;
rollback;
