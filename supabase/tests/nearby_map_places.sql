begin;
do $test$
declare uid uuid:=gen_random_uuid(); tag text:=gen_random_uuid()::text;result jsonb;rejected boolean;
begin
 insert into auth.users(id) values(uid);
 insert into private.catalog_places(source,external_id,name,latitude,longitude,active) values
 ('qa_map',tag||'near','Cerca',11.08001,-71.60001,true),
 ('qa_map',tag||'hidden','Inactivo',11.08001,-71.60001,false),
 ('qa_map',tag||'far','Lejos',11.18,-71.6,true);
 perform set_config('request.jwt.claim.sub',uid::text,true);
 result:=public.catalog_nearby(11.08,-71.6,3000);
 assert exists(select 1 from jsonb_array_elements(result) p where p->>'name'='Cerca'),'Nearby active place returned';
 assert not exists(select 1 from jsonb_array_elements(result) p where p->>'name' in ('Inactivo','Lejos')),'Inactive and distant places excluded';
 assert jsonb_array_length(public.catalog_nearby(91,-71,3000))=0,'Invalid center rejected';
 assert jsonb_array_length(public.catalog_nearby(11,-71,'NaN'::float8))=0,'Invalid radius rejected';
 insert into private.catalog_places(source,external_id,name,latitude,longitude)
 select 'qa_map',tag||n,'Prueba '||n,11.08+n*0.00000001,-71.6 from generate_series(1,110)n;
 assert jsonb_array_length(public.catalog_nearby(11.08,-71.6,5000))=100,'Payload capped at 100';
 assert not has_function_privilege('anon','public.catalog_nearby(double precision,double precision,double precision)','EXECUTE'),'Anonymous access denied';
 perform set_config('request.jwt.claim.sub','',true);
 rejected:=false;begin perform public.catalog_nearby(11,-71,3000);exception when others then rejected:=true;end;
 assert rejected,'Session required';
end;$test$;
rollback;
