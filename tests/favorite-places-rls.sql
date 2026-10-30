-- Run on a database with at least two profiles. All fixture changes roll back.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles order by id limit 1),true);
set local role authenticated;
do $$
declare uid uuid:=auth.uid(); other_id uuid;
begin
 select id into other_id from public.profiles where id<>uid limit 1;
 if other_id is null then raise exception 'Two profiles required'; end if;
 insert into public.favorite_places(user_id,kind,label,latitude,longitude) values(uid,'home','QA casa',11,-71)
 on conflict(user_id,kind) do update set label=excluded.label,latitude=excluded.latitude,longitude=excluded.longitude;
 if not exists(select 1 from public.favorite_places where kind='home' and label='QA casa') then raise exception 'Save failed';end if;
 if exists(select 1 from public.favorite_places where user_id<>uid) then raise exception 'RLS read failed';end if;
 begin
  insert into public.favorite_places(user_id,kind,label,latitude,longitude) values(other_id,'work','QA ajeno',11,-71);
  raise exception 'Cross-user write allowed';
 exception when insufficient_privilege then null;end;
 begin
  update public.favorite_places set latitude=91 where kind='home';
  raise exception 'Invalid coordinate allowed';
 exception when check_violation then null;end;
 delete from public.favorite_places where kind='home';
end $$;
rollback;
