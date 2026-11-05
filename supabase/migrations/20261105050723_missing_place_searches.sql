create table private.missing_place_searches (
 query_key text not null check(length(query_key) between 3 and 110),
 user_id uuid not null references public.profiles(id) on delete cascade,
 label text not null check(length(label) between 3 and 110),
 hits bigint not null default 1,
 last_seen timestamptz not null default now(),
 primary key(query_key,user_id)
);
alter table private.missing_place_searches enable row level security;
revoke all on private.missing_place_searches from public,anon,authenticated;
create index missing_place_searches_user on private.missing_place_searches(user_id);

create function private.missing_place_registered(q text) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from private.catalog_places c where c.name_key=q
 or exists(select 1 from unnest(c.aliases) a where private.catalog_normalize(a)=q))
$$;
revoke all on function private.missing_place_registered(text) from public,anon,authenticated;

create function private.missing_places(action text,search_query text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); q text:=private.catalog_normalize(search_query); result jsonb;
begin
 if uid is null then raise exception 'Inicia sesión';end if;
 if action='record' then
  if (select role from public.profiles where id=uid) is distinct from 'passenger' then return '{}'::jsonb;end if;
  if length(search_query)>110 or length(q) not between 3 and 110 or private.missing_place_registered(q) then return '{}'::jsonb;end if;
  -- Límite por usuario para evitar que los reintentos inflen el ranking.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if exists(select 1 from private.missing_place_searches where user_id=uid and last_seen>now()-interval '1 minute') then return '{}'::jsonb;end if;
  insert into private.missing_place_searches(query_key,user_id,label) values(q,uid,btrim(search_query))
  on conflict(query_key,user_id) do update set hits=private.missing_place_searches.hits+1,last_seen=now();
  return '{}'::jsonb;
 elsif action='list' then
  if (select role from public.profiles where id=uid) is distinct from 'admin' then raise exception 'Solo administradores';end if;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into result from (
   select query_key,(array_agg(label order by last_seen desc))[1] as label,sum(hits) as searches,
    count(*) as users,max(last_seen) as last_seen
   from private.missing_place_searches s where not private.missing_place_registered(s.query_key)
   group by query_key order by sum(hits) desc,count(*) desc,max(last_seen) desc,query_key limit 100
  )r;
  return result;
 end if;
 raise exception 'Acción inválida';
end;$$;
revoke all on function private.missing_places(text,text) from public,anon;
grant execute on function private.missing_places(text,text) to authenticated;
create function public.missing_places(action text,search_query text default '') returns jsonb
language sql security invoker set search_path='' as $$select private.missing_places(action,search_query)$$;
revoke all on function public.missing_places(text,text) from public,anon;
grant execute on function public.missing_places(text,text) to authenticated;
