-- Eliminación de cuenta: completa sin viajes; anonimizada con historial; bloqueos. Rollback.
begin;
do $test$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); t uuid:=gen_random_uuid(); rejected boolean; r jsonb;
begin
  insert into auth.users(id,email,raw_user_meta_data) values(a,'a@x.com','{"display_name":"Ana"}'),(b,'b@x.com','{"display_name":"Beto","contact_phone":"0412"}'),(d,'d@x.com','{}');
  update public.profiles set role='driver',approved=true where id=d;
  insert into public.trips(id,passenger_id,driver_id,origin,destination,status) values(t,b,d,'A','B','assigned');
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',a::text,true);
  rejected:=false; begin perform public.delete_my_account('borrar'); exception when raise_exception then rejected:=sqlerrm='Confirmación inválida'; end;
  assert rejected,'Confirmation';
  r:=public.delete_my_account('ELIMINAR'); assert r->>'mode'='full','Full delete';
  perform set_config('request.jwt.claim.sub',b::text,true);
  rejected:=false; begin perform public.delete_my_account('eliminar'); exception when raise_exception then rejected:=sqlerrm='Tienes un viaje activo'; end;
  assert rejected,'Active trip';
  reset role; update public.trips set status='finished' where id=t;
  set local role authenticated; perform set_config('request.jwt.claim.sub',b::text,true);
  r:=public.delete_my_account('eliminar'); assert r->>'mode'='anonymized','Anonymized';
  reset role;
  assert not exists(select 1 from auth.users where id=a),'A gone';
  assert (select email like 'eliminado-%' and raw_user_meta_data='{}'::jsonb and banned_until='infinity' from auth.users where id=b),'B anonymized';
  assert (select suspended from public.profiles where id=b),'B suspended';
  assert exists(select 1 from public.trips where id=t),'Trip kept';
  raise notice 'delete-account ok';
end
$test$;
rollback;
