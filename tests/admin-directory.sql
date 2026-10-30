-- Requires an administrator and a non-admin profile. All changes roll back.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||'{"display_name":"José QA directorio"}'::jsonb where id=(select id from public.profiles where role='passenger' limit 1);
set local role authenticated;
do $$ declare result jsonb;begin
 result:=public.admin_records('users','jose qa directorio',0);
 if (result->>'total')::integer<1 or not exists(select 1 from jsonb_array_elements(result->'items') i where i->>'name'='José QA directorio') then raise exception 'Name or accent search failed';end if;
 result:=public.admin_records('trips','',0);
 if jsonb_typeof(result->'items')<>'array' or jsonb_array_length(result->'items')>12 then raise exception 'Trip pagination failed';end if;
 if has_function_privilege('anon','public.admin_records(text,text,integer)','EXECUTE') then raise exception 'Anonymous access';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role<>'admin' limit 1),true);
set local role authenticated;
do $$begin
 begin perform public.admin_records('team','',0);raise exception 'Non-admin access allowed';
 exception when raise_exception then if sqlerrm<>'Solo administradores' then raise;end if;end;
 begin perform public.admin_records('trips','',0);raise exception 'Non-admin trips access allowed';
 exception when raise_exception then if sqlerrm<>'Solo administradores' then raise;end if;end;
end $$;
rollback;
