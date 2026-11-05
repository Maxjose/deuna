-- Promociones emergentes: una vez por publicación y por público. Rollback.
begin;
do $test$
declare a uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); pid uuid; r jsonb; rejected boolean;
begin
  insert into auth.users(id,raw_user_meta_data) values(a,'{}'),(p,'{}'),(d,'{}');
  update public.profiles set role='admin' where id=a; update public.profiles set role='driver' where id=d;
  set local role authenticated; perform set_config('request.jwt.claim.sub',a::text,true);
  pid:=public.admin_promo_save('{"title":"Promo","image_url":"https://x.test/a.png","link_url":"https://de1na.app","audience":"passenger"}');
  rejected:=false; begin perform public.admin_promo_save('{"title":"Mal","image_url":"https://x.test/a.png","link_url":"javascript:alert(1)"}'); exception when raise_exception then rejected:=sqlerrm='Enlace inválido'; end;
  assert rejected,'Bad link';
  perform set_config('request.jwt.claim.sub',p::text,true);
  assert public.my_promo() is null,'Not published';
  perform set_config('request.jwt.claim.sub',a::text,true); perform public.admin_promo_publish(pid,true);
  perform set_config('request.jwt.claim.sub',p::text,true);
  r:=public.my_promo(); assert r->>'id'=pid::text,'Shown';
  perform public.dismiss_promo(pid); assert public.my_promo() is null,'Once';
  perform set_config('request.jwt.claim.sub',d::text,true); assert public.my_promo() is null,'Audience';
  rejected:=false; begin perform public.admin_promo_publish(pid,true); exception when raise_exception then rejected:=sqlerrm='No autorizado'; end;
  assert rejected,'Driver cannot publish';
  perform set_config('request.jwt.claim.sub',a::text,true); perform pg_sleep(0.01); perform public.admin_promo_publish(pid,true);
  perform set_config('request.jwt.claim.sub',p::text,true); assert public.my_promo()->>'id'=pid::text,'Republished shows again';
  raise notice 'promo-popups ok';
end $test$;
rollback;
