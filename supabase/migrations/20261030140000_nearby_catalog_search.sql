create or replace function private.catalog_search(search_query text,center_lat double precision,center_lng double precision) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q text:=private.catalog_normalize(search_query);lat double precision:=center_lat;lng double precision:=center_lng;result jsonb;
begin
 if auth.uid() is null then raise exception 'Inicia sesion';end if;
 if q in ('pizzeria','pizzerias','pizzas','pizza') then q:='pizz';end if;
 if length(q)<3 or length(q)>120 then return '[]'::jsonb;end if;
 if lat is null or lng is null or not(lat between 8.3 and 12.6 and lng between -73.5 and -70.5) then lat:=11.087;lng:= -71.603;end if;
 select coalesce(jsonb_agg(row_to_json(p)),'[]'::jsonb) into result from (
  select c.id,c.name,c.latitude,c.longitude,c.address,c.municipality,c.reference
  from private.catalog_places c
  where c.active and c.latitude between 8.3 and 12.6 and c.longitude between -73.5 and -70.5
   and (c.search_text like '%'||q||'%' or c.name_key operator(extensions.%) q)
  order by case when c.search_text like '%'||q||'%' then 0 else 1 end,
   power(c.latitude-lat,2)+power((c.longitude-lng)*cos(radians(lat)),2),
   extensions.similarity(c.name_key,q) desc,c.id limit 24
 )p;
 return result;
end;$$;
