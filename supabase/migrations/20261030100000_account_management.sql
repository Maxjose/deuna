alter table public.profiles add column suspended boolean not null default false;
create or replace function private.admin_records(section text,search_query text default '',page_number integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q text:=lower(extensions.unaccent(left(btrim(coalesce(search_query,'')),120))); offset_rows integer:=greatest(0,least(100000,coalesce(page_number,0)))*12; result jsonb;
begin
 if auth.uid() is null or (select role from public.profiles where id=auth.uid()) is distinct from 'admin' then raise exception 'Solo administradores';end if;
 if section in ('team','users') then
  with records as (
   select p.id,p.role,p.approved,p.available,p.suspended,
    coalesce(nullif(btrim(left(u.raw_user_meta_data->>'display_name',80)),''),nullif(btrim(left(u.raw_user_meta_data->>'full_name',80)),''),'') as name,
    coalesce(u.email,'') as email,left(coalesce(u.raw_user_meta_data->>'contact_phone',''),30) as phone
   from public.profiles p join auth.users u on u.id=p.id where (section='team' and p.role='driver') or (section='users' and p.role='passenger')
  ), filtered as (select * from records where q='' or position(q in lower(extensions.unaccent(concat_ws(' ',name,email,phone,id::text))))>0)
  select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from filtered order by lower(coalesce(nullif(name,''),email)),id limit 12 offset offset_rows)r),'[]'::jsonb)) into result;
 elsif section='trips' or section like 'person:%' then
  with records as (
   select t.id,t.origin,t.destination,t.zone,t.fare_cents,t.distance_meters,t.status,t.passenger_id,t.driver_id,t.created_at,
    coalesce(nullif(btrim(left(p.raw_user_meta_data->>'display_name',80)),''),nullif(btrim(left(p.raw_user_meta_data->>'full_name',80)),''),p.email,'Usuario sin nombre') as passenger_name,
    case when t.driver_id is not null then coalesce(nullif(btrim(left(d.raw_user_meta_data->>'display_name',80)),''),nullif(btrim(left(d.raw_user_meta_data->>'full_name',80)),''),d.email,'Motorizado sin nombre') end as driver_name,
    p.email as passenger_email,d.email as driver_email
   from public.trips t left join auth.users p on p.id=t.passenger_id left join auth.users d on d.id=t.driver_id
  ), filtered as (select * from records where (section='trips' or passenger_id=(case when section like 'person:%' then substring(section from 8)::uuid end) or driver_id=(case when section like 'person:%' then substring(section from 8)::uuid end)) and (q='' or position(q in lower(extensions.unaccent(concat_ws(' ',id::text,destination,origin,passenger_name,driver_name,passenger_email,driver_email))))>0))
  select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from filtered order by created_at desc,id limit 12 offset offset_rows)r),'[]'::jsonb)) into result;
 else raise exception 'Sección inválida';end if;
 return result;
end $$;
-- Keep suspension checks inside the same transaction lock used by trip mutations.
do $$ declare definition text; marker text:='select * into strict p from public.profiles where id=uid;'; begin
 select pg_get_functiondef('private.operate(text,jsonb)'::regprocedure) into definition;
 if position(marker in definition)=0 then raise exception 'Missing operate guard insertion point';end if;
 execute replace(definition,marker,marker||' if p.suspended then raise exception ''Cuenta suspendida'';end if;');
end $$;
create or replace function private.can_receive() returns boolean language sql stable security definer set search_path='' as $$
select coalesce((select role='driver' and approved and available and not suspended from public.profiles where id=auth.uid()),false)$$;
create function private.admin_manage(person_id uuid,operation text) returns void language plpgsql security definer set search_path='' as $$
declare target public.profiles;
begin
 if auth.uid() is null or (select role from public.profiles where id=auth.uid()) is distinct from 'admin' then raise exception 'Solo administradores';end if;
 perform pg_advisory_xact_lock(4173001);
 select * into strict target from public.profiles where id=person_id for update;
 if target.role='admin' then raise exception 'No se pueden modificar administradores';end if;
 if exists(select 1 from public.trips where (passenger_id=person_id or driver_id=person_id) and status not in ('finished','cancelled')) then raise exception 'Esta cuenta tiene un viaje activo';end if;
 if operation='assign_driver' and target.role='passenger' and not target.suspended then
  update public.profiles set role='driver',approved=false,available=false where id=person_id;
 elsif operation in ('suspend_account','restore_account') and target.role='passenger' then
  update public.profiles set suspended=(operation='suspend_account'),available=false where id=person_id;
 elsif operation in ('approve_driver','suspend_driver') and target.role='driver' and not target.suspended then
  perform private.operate('driver',jsonb_build_object('id',person_id,'approved',operation='approve_driver'));
 else raise exception 'Operación inválida para esta cuenta';end if;
end $$;
revoke all on function private.admin_manage(uuid,text) from public,anon;
grant execute on function private.admin_manage(uuid,text) to authenticated;
create function public.admin_manage(person_id uuid,operation text) returns void language sql security invoker set search_path='' as $$select private.admin_manage(person_id,operation)$$;
revoke all on function public.admin_manage(uuid,text) from public,anon;
grant execute on function public.admin_manage(uuid,text) to authenticated;
