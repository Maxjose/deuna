create function private.admin_records(section text,search_query text default '',page_number integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q text:=lower(extensions.unaccent(left(btrim(coalesce(search_query,'')),120))); offset_rows integer:=greatest(0,least(100000,coalesce(page_number,0)))*12; result jsonb;
begin
 if auth.uid() is null or (select role from public.profiles where id=auth.uid()) is distinct from 'admin' then raise exception 'Solo administradores';end if;
 if section='team' then
  with records as (
   select p.id,p.role,p.approved,p.available,
    coalesce(nullif(btrim(left(u.raw_user_meta_data->>'display_name',80)),''),nullif(btrim(left(u.raw_user_meta_data->>'full_name',80)),''),'') as name,
    coalesce(u.email,'') as email,left(coalesce(u.raw_user_meta_data->>'contact_phone',''),30) as phone
   from public.profiles p join auth.users u on u.id=p.id
  ), filtered as (select * from records where q='' or position(q in lower(extensions.unaccent(concat_ws(' ',name,email,phone,id::text))))>0)
  select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from filtered order by lower(coalesce(nullif(name,''),email)),id limit 12 offset offset_rows)r),'[]'::jsonb)) into result;
 elsif section='trips' then
  with records as (
   select t.id,t.origin,t.destination,t.zone,t.fare_cents,t.distance_meters,t.status,t.passenger_id,t.driver_id,t.created_at,
    coalesce(nullif(btrim(left(p.raw_user_meta_data->>'display_name',80)),''),nullif(btrim(left(p.raw_user_meta_data->>'full_name',80)),''),p.email,'Usuario sin nombre') as passenger_name,
    case when t.driver_id is not null then coalesce(nullif(btrim(left(d.raw_user_meta_data->>'display_name',80)),''),nullif(btrim(left(d.raw_user_meta_data->>'full_name',80)),''),d.email,'Motorizado sin nombre') end as driver_name,
    p.email as passenger_email,d.email as driver_email
   from public.trips t left join auth.users p on p.id=t.passenger_id left join auth.users d on d.id=t.driver_id
  ), filtered as (select * from records where q='' or position(q in lower(extensions.unaccent(concat_ws(' ',id::text,destination,origin,passenger_name,driver_name,passenger_email,driver_email))))>0)
  select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from filtered order by created_at desc,id limit 12 offset offset_rows)r),'[]'::jsonb)) into result;
 else raise exception 'Sección inválida';end if;
 return result;
end $$;
revoke all on function private.admin_records(text,text,integer) from public,anon;
grant execute on function private.admin_records(text,text,integer) to authenticated;
create function public.admin_records(section text,search_query text default '',page_number integer default 0) returns jsonb
language sql security invoker set search_path='' as $$select private.admin_records(section,search_query,page_number)$$;
revoke all on function public.admin_records(text,text,integer) from public,anon;
grant execute on function public.admin_records(text,text,integer) to authenticated;
