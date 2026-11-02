-- Tarifa nocturna: recargo porcentual en un horario (hora de Venezuela), configurable por la administración.
alter table public.service_settings
 add column night_enabled boolean not null default false,
 add column night_start time not null default '20:00',
 add column night_end time not null default '05:00',
 add column night_percent integer not null default 0 check (night_percent between 0 and 300);
do $$declare definition text;marker text:='rounding_cents=coalesce((payload->>''rounding_cents'')::integer,rounding_cents) where id=1;';begin
 select pg_get_functiondef('private.operate(text,jsonb)'::regprocedure) into definition;
 if position(marker in definition)=0 then raise exception 'Missing fares insertion point';end if;
 execute replace(definition,marker,'rounding_cents=coalesce((payload->>''rounding_cents'')::integer,rounding_cents),'
  ||'night_enabled=coalesce((payload->>''night_enabled'')::boolean,night_enabled),night_start=coalesce((payload->>''night_start'')::time,night_start),'
  ||'night_end=coalesce((payload->>''night_end'')::time,night_end),night_percent=coalesce((payload->>''night_percent'')::integer,night_percent) where id=1;');
end $$;
