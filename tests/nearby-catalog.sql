-- Temporary places are rolled back after verifying category and distance ranking.
begin;
insert into private.catalog_places(source,external_id,name,latitude,longitude,category,active) values('qa-nearby',gen_random_uuid()::text,'QA esquina',11.087,-71.603,'Pizzeria',true),('qa-nearby',gen_random_uuid()::text,'Pizzeria',11.8,-71.6,'Pizza',true);
select set_config('request.jwt.claim.sub',(select id::text from public.profiles limit 1),true);
set local role authenticated;
do $$declare result jsonb;begin
 result:=public.catalog_search('pizzería',11.087,-71.603);
 if result->0->>'name'<>'QA esquina' then raise exception 'Nearby category did not rank first';end if;
 result:=public.catalog_search('pizzerias',11.087,-71.603);
 if result->0->>'name'<>'QA esquina' then raise exception 'Plural category failed';end if;
end $$;
rollback;
