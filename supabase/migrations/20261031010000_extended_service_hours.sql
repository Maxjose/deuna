create function private.service_is_open(clock time default (now() at time zone 'America/Caracas')::time) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select s.enabled and (
  s.open_time=s.close_time or
  (s.open_time<s.close_time and clock>=s.open_time and clock<s.close_time) or
  (s.open_time>s.close_time and (clock>=s.open_time or clock<s.close_time)) or
  exists(select 1 from public.profiles p join private.driver_presence d on d.driver_id=p.id cross join private.availability_settings c
   where p.role='driver' and p.approved and p.available and not p.suspended
   and d.last_seen>now()-make_interval(mins=>c.signal_minutes)
   and d.last_activity>now()-make_interval(mins=>c.idle_minutes+c.grace_minutes)
   and not exists(select 1 from public.trips t where t.driver_id=p.id and t.status in ('assigned','arrived','ongoing')))
 ) from public.service_settings s where id=1),false)
$$;
revoke all on function private.service_is_open(time) from public,anon,authenticated;
create function private.service_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'No autorizado';end if;
 return jsonb_build_object('open',private.service_is_open());
end $$;
revoke all on function private.service_status() from public,anon;
grant execute on function private.service_status() to authenticated;
create function public.service_status() returns jsonb language sql stable security invoker set search_path='' as $$select private.service_status()$$;
revoke all on function public.service_status() from public,anon;
grant execute on function public.service_status() to authenticated;
do $$declare definition text;old_guard text:='if not s.enabled or not ((s.open_time=s.close_time) or (s.open_time<s.close_time and current_clock>=s.open_time and current_clock<s.close_time) or (s.open_time>s.close_time and (current_clock>=s.open_time or current_clock<s.close_time))) then raise exception ''Servicio cerrado'';end if;';begin
 select pg_get_functiondef('private.operate(text,jsonb)'::regprocedure) into definition;
 if position(old_guard in definition)=0 then raise exception 'Missing service guard';end if;
 execute replace(definition,old_guard,'if not private.service_is_open() then raise exception ''Servicio cerrado'';end if;');
end $$;
