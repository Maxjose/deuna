-- Límite de cancelaciones del conductor. Rollback.
begin;
do $test$
declare p uuid; d uuid:=gen_random_uuid(); t uuid; i int; rejected boolean; st jsonb;
begin
  insert into auth.users(id) values(d); update public.profiles set role='driver',approved=true where id=d;
  for i in 1..3 loop
    p:=gen_random_uuid(); t:=gen_random_uuid();
    insert into auth.users(id) values(p);
    insert into public.trips(id,passenger_id,driver_id,origin,destination,status) values(t,p,d,'A','B','assigned');
    set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
    if i<3 then
      perform public.operate('request_cancel',jsonb_build_object('id',t,'reason','Pasajero no aparece'));
      perform set_config('request.jwt.claim.sub',p::text,true);
      perform public.operate('respond_cancel',jsonb_build_object('id',t,'approved',true));
      reset role;
      assert (select cancelled_by='driver' and cancelled_stage='assigned' and cancelled_at is not null from public.trips where id=t),'Marked';
    else
      rejected:=false; begin perform public.operate('request_cancel',jsonb_build_object('id',t,'reason','Pasajero no aparece')); exception when raise_exception then rejected:=sqlerrm='Límite de cancelaciones'; end;
      assert rejected,'Third cancel blocked';
      st:=public.my_cancel_state(); assert (st->>'used')::int=2 and st->>'blocked_until' is not null,'State '||st::text;
      reset role;
    end if;
  end loop;
  -- Pasado el plazo vuelve a poder cancelar.
  update public.trips set cancelled_at=now()-interval '5 hours' where driver_id=d and status='cancelled';
  set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
  perform public.operate('request_cancel',jsonb_build_object('id',t,'reason','Pasajero no aparece'));
  reset role;
  assert (select cancel_requested from public.trips where id=t),'Allowed after window';
  -- Sin motivo no se puede solicitar.
  update public.trips set cancel_requested=false,cancel_requested_at=now()-interval '2 minutes' where id=t;
  set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
  rejected:=false; begin perform public.operate('request_cancel',jsonb_build_object('id',t)); exception when raise_exception then rejected:=sqlerrm='Motivo requerido'; end;
  assert rejected,'Reason required';
  reset role;
  -- Después de «Llegué» cuenta doble: una sola cancelación bloquea con límite 2.
  update public.trips set status='cancelled',cancelled_by='driver',cancelled_stage='arrived',cancelled_at=now() where id=t;
  set local role authenticated; perform set_config('request.jwt.claim.sub',d::text,true);
  st:=public.my_cancel_state(); assert st->>'blocked_until' is not null,'Arrived counts double '||st::text;
  reset role;
  -- Pasajero: 3 cada 3 horas, con motivo; cancelar mientras busca no cuenta.
  p:=gen_random_uuid(); insert into auth.users(id) values(p);
  for i in 1..4 loop
    t:=gen_random_uuid();
    insert into public.trips(id,passenger_id,driver_id,origin,destination,status) values(t,p,d,'A','B'||i,'assigned');
    set local role authenticated; perform set_config('request.jwt.claim.sub',p::text,true);
    if i=1 then
      rejected:=false; begin perform public.operate('cancel',jsonb_build_object('id',t)); exception when raise_exception then rejected:=sqlerrm='Motivo requerido'; end;
      assert rejected,'Passenger reason';
    end if;
    if i<4 then perform public.operate('cancel',jsonb_build_object('id',t,'reason','Ya no lo necesito'));
    else
      rejected:=false; begin perform public.operate('cancel',jsonb_build_object('id',t,'reason','Ya no lo necesito')); exception when raise_exception then rejected:=sqlerrm='Límite de cancelaciones'; end;
      assert rejected,'Passenger limit';
    end if;
    reset role;
  end loop;
  assert (select count(*) from public.trips where passenger_id=p and cancelled_by='passenger' and cancel_reason='Ya no lo necesito')=3,'Passenger reasons saved';
  raise notice 'driver-cancel-limit ok';
end
$test$;
rollback;
