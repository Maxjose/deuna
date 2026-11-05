begin;
do $test$
declare admin_id uuid:=gen_random_uuid(); p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();
 tag text:=replace(gen_random_uuid()::text,'-','');q text;result jsonb;rejected boolean;
begin
 insert into auth.users(id) values(admin_id),(p1),(p2);
 update public.profiles set role='admin' where id=admin_id;
 q:='Bodega Águila '||tag;
 perform set_config('request.jwt.claim.sub',p1::text,true);
 perform public.missing_places('record',q);
 perform public.missing_places('record',upper(q));
 assert (select sum(hits)=1 from private.missing_place_searches where user_id=p1),'Retry is not counted';
 update private.missing_place_searches set last_seen=now()-interval '2 minutes' where user_id=p1;
 perform public.missing_places('record',upper(q));
 perform set_config('request.jwt.claim.sub',p2::text,true);
 perform public.missing_places('record',replace(q,'Á','A'));
 rejected:=false;begin perform public.missing_places('list');exception when others then rejected:=true;end;
 assert rejected,'Passengers cannot read ranking';
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 select x into result from jsonb_array_elements(public.missing_places('list')) x where x->>'query_key'=private.catalog_normalize(q);
 assert (result->>'searches')::int=3 and (result->>'users')::int=2,'Accents grouped, users counted separately';
 insert into private.catalog_places(source,external_id,name,latitude,longitude,aliases,active)
 values('qa_missing',tag,'Otro nombre '||tag,11.087,-71.603,array[q],false);
 assert not exists(select 1 from jsonb_array_elements(public.missing_places('list')) x where x->>'query_key'=private.catalog_normalize(q)),'Registered alias disappears, including inactive places';
 assert not has_table_privilege('authenticated','private.missing_place_searches','SELECT'),'Raw search data is private';
 assert not has_function_privilege('anon','public.missing_places(text,text)','EXECUTE'),'Anonymous RPC denied';
 perform set_config('request.jwt.claim.sub','',true);
 rejected:=false;begin perform public.missing_places('record',q);exception when others then rejected:=true;end;
 assert rejected,'Session required';
end;$test$;
rollback;
