create index catalog_active_coordinates on private.catalog_places(latitude,longitude) where active;
create function private.catalog_nearby(center_lat double precision,center_lng double precision,radius_m double precision)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;r double precision:=least(5000,greatest(250,radius_m));
begin
 if auth.uid() is null then raise exception 'Inicia sesión';end if;
 if center_lat is null or center_lng is null or radius_m is null
 or not(center_lat between -90 and 90 and center_lng between -180 and 180 and radius_m between 1 and 10000000) then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) into result from (
  select id,name,latitude,longitude from private.catalog_places
  where active and latitude between center_lat-r/111320 and center_lat+r/111320
  and longitude between center_lng-r/(111320*greatest(0.01,cos(radians(center_lat)))) and center_lng+r/(111320*greatest(0.01,cos(radians(center_lat))))
  and power((latitude-center_lat)*111320,2)+power((longitude-center_lng)*111320*cos(radians(center_lat)),2)<=r*r
  order by power((latitude-center_lat)*111320,2)+power((longitude-center_lng)*111320*cos(radians(center_lat)),2),id limit 100
 )p;
 return result;
end;$$;
revoke all on function private.catalog_nearby(double precision,double precision,double precision) from public,anon;
grant execute on function private.catalog_nearby(double precision,double precision,double precision) to authenticated;
create function public.catalog_nearby(center_lat double precision,center_lng double precision,radius_m double precision default 3000)
returns jsonb language sql security invoker set search_path='' as $$select private.catalog_nearby(center_lat,center_lng,radius_m)$$;
revoke all on function public.catalog_nearby(double precision,double precision,double precision) from public,anon;
grant execute on function public.catalog_nearby(double precision,double precision,double precision) to authenticated;
