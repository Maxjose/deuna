-- Tokens de seguimiento para el servicio nativo de ubicación. Transacción con rollback.
begin;
do $test$
declare passenger uuid:=gen_random_uuid(); driver uuid:=gen_random_uuid(); other_driver uuid:=gen_random_uuid(); trip uuid:=gen_random_uuid();
  token text; old_token text; rejected boolean;
begin
  insert into auth.users(id) values(passenger),(driver),(other_driver);
  update public.profiles set role='driver',approved=true where id in (driver,other_driver);
  insert into public.trips(id,passenger_id,driver_id,origin,destination,status) values(trip,passenger,driver,'A','B','assigned');
  set local role authenticated;
  -- Solo el conductor del viaje obtiene token.
  perform set_config('request.jwt.claim.sub',passenger::text,true);
  rejected:=false; begin perform public.issue_tracking_token(trip); exception when raise_exception then rejected:=true; end;
  assert rejected,'Passenger got token';
  perform set_config('request.jwt.claim.sub',other_driver::text,true);
  rejected:=false; begin perform public.issue_tracking_token(trip); exception when raise_exception then rejected:=true; end;
  assert rejected,'Other driver got token';
  perform set_config('request.jwt.claim.sub',driver::text,true);
  old_token:=public.issue_tracking_token(trip);
  token:=public.issue_tracking_token(trip);
  assert token ~ '^[0-9a-f]{64}$' and token<>old_token,'Token format';
  -- La sesión normal sigue funcionando con la lógica común.
  assert (public.share_location(trip,10.7,-71.6,20)->>'saved')='true','Session share broken';
  reset role;
  update public.trip_locations set updated_at=now()-interval '5 seconds',recorded_at=now()-interval '5 seconds' where trip_id=trip;
  -- Sin sesión (anon): con token válido escribe; el token anterior ya no vale; uno inventado tampoco.
  set local role anon;
  perform set_config('request.jwt.claim.sub','',true);
  assert (public.share_location_token(token,10.71,-71.61,15,90,4)->>'saved')='true','Token share failed';
  rejected:=false; begin perform public.share_location_token(old_token,10.7,-71.6,15); exception when raise_exception then rejected:=sqlerrm='Este viaje ya no comparte ubicación'; end;
  assert rejected,'Old token still valid';
  rejected:=false; begin perform public.share_location_token(repeat('a',64),10.7,-71.6,15); exception when raise_exception then rejected:=true; end;
  assert rejected,'Fake token accepted';
  rejected:=false; begin perform public.share_location_token('x',10.7,-71.6,15); exception when raise_exception then rejected:=sqlerrm='Token inválido'; end;
  assert rejected,'Malformed token accepted';
  -- anon no puede emitir tokens ni leer la tabla.
  rejected:=false; begin perform public.issue_tracking_token(trip); exception when insufficient_privilege then rejected:=true; end;
  assert rejected,'Anon issued token';
  rejected:=false; begin perform 1 from private.tracking_tokens; exception when insufficient_privilege then rejected:=true; end;
  assert rejected,'Anon reads tokens';
  reset role;
  assert (select latitude from public.trip_locations where trip_id=trip)=10.71,'Token write not applied';
  -- Al terminar el viaje se borran tokens y posición; el token deja de servir.
  update public.trips set status='finished' where id=trip;
  assert not exists(select 1 from private.tracking_tokens where trip_id=trip),'Tokens not purged';
  set local role anon;
  rejected:=false; begin perform public.share_location_token(token,10.7,-71.6,15); exception when raise_exception then rejected:=sqlerrm='Este viaje ya no comparte ubicación'; end;
  assert rejected,'Token works after trip end';
  reset role;
  raise notice 'tracking-tokens ok';
end
$test$;
rollback;
