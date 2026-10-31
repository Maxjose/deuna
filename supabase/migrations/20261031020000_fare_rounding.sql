alter table public.service_settings add column rounding_cents integer not null default 50 check(rounding_cents in (1,50,100));
do $$declare definition text;marker text:='minimum_cents=(payload->>''minimum_cents'')::integer where id=1;';begin
 select pg_get_functiondef('private.operate(text,jsonb)'::regprocedure) into definition;
 if position(marker in definition)=0 then raise exception 'Missing fares insertion point';end if;
 execute replace(definition,marker,'minimum_cents=(payload->>''minimum_cents'')::integer,rounding_cents=coalesce((payload->>''rounding_cents'')::integer,rounding_cents) where id=1;');
end $$;
