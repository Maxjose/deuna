-- Carros: emparejamiento por tipo, vehículo del conductor, precios de plan y validaciones. Rollback.
begin;
do $test$
declare pas uuid:=gen_random_uuid(); moto uuid:=gen_random_uuid(); car uuid:=gen_random_uuid(); t uuid:=gen_random_uuid(); ok boolean; def text; n integer;
begin
  insert into auth.users(id,raw_user_meta_data) values(pas,'{}'),(moto,'{}'),(car,'{}');
  update public.profiles set role='driver' where id in (moto,car);
  set local role authenticated;
  -- El conductor elige carro antes de ser aprobado.
  perform set_config('request.jwt.claim.sub',car::text,true);
  ok:=false; begin perform public.save_my_vehicle('AB123CD','Corolla','Gris','car',null); exception when raise_exception then ok:=sqlerrm='Año inválido'; end; assert ok,'Car needs year';
  perform public.save_my_vehicle('AB123CD','Corolla','Gris','car',2015);
  assert (public.my_driver_data()->>'vehicle_type')='car','Type saved';
  reset role;
  insert into private.driver_payout(driver_id,bank,id_number,phone) values(car,'0102','12345678','04141234567');
  update public.profiles set approved=true,available=true where id=car;
  insert into private.driver_document_exemptions(driver_id,enabled) values(car,true),(moto,true);
  -- Moto sin vehículo de moto no puede aprobarse.
  insert into private.driver_vehicles(driver_id,plate,model,color,vehicle_type,year) values(moto,'XY987ZZ','Civic','Azul','car',2010);
  insert into private.driver_payout(driver_id,bank,id_number,phone) values(moto,'0102','87654321','04141234568');
  ok:=false; begin update public.profiles set approved=true where id=moto; exception when raise_exception then ok:=sqlerrm='Faltan datos del conductor'; end; assert ok,'Type mismatch blocks approval';
  update private.driver_vehicles set vehicle_type='moto',year=null where driver_id=moto;
  update public.profiles set approved=true,available=true where id=moto;
  -- Tipo bloqueado tras aprobación.
  set local role authenticated; perform set_config('request.jwt.claim.sub',car::text,true);
  ok:=false; begin perform public.save_my_vehicle('AB123CD','Corolla','Gris','moto',null); exception when raise_exception then ok:=sqlerrm='Tipo bloqueado'; end; assert ok,'Locked';
  reset role;
  -- Viaje de carro: lo ve el conductor de carro, no el de moto.
  insert into public.trips(id,passenger_id,origin,destination,status,fare_cents,payment_method,vehicle_type) values(t,pas,'A','B','searching',500,'cash','car');
  set local role authenticated; perform set_config('request.jwt.claim.sub',moto::text,true);
  select count(*) into n from public.trips where id=t; assert n=0,'Moto cannot see car trip';
  perform set_config('request.jwt.claim.sub',car::text,true);
  select count(*) into n from public.trips where id=t; assert n=1,'Car sees car trip';
  reset role;
  def:=pg_get_functiondef('private.operate(text,jsonb)'::regprocedure); assert position('t.vehicle_type is distinct from p.vehicle_type' in def)>0,'Accept guard';
  def:=pg_get_functiondef('private.queue_trip_push()'::regprocedure); assert position('p.vehicle_type=new.vehicle_type' in def)>0,'Push filter';
  def:=pg_get_functiondef('private.insert_quoted_trip(jsonb)'::regprocedure);
  assert position('select * into strict s' in def) < position('Viaje de prueba no disponible' in def),'Settings loaded first';
  assert position('Vehiculo no disponible' in def)>0,'Vehicle switch';
  assert private.plan_price(car,'week')=(select sub_car_week_cents from public.service_settings where id=1),'Car plan price';
  assert private.plan_price(moto,'month')=(select sub_month_cents from public.service_settings where id=1),'Moto plan price';
  raise notice 'cars ok';
end $test$;
rollback;
