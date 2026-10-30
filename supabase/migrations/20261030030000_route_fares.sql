alter table public.service_settings
  add column base_cents integer not null default 0 check(base_cents between 0 and 1000000),
  add column per_km_cents integer check(per_km_cents between 1 and 1000000),
  add column minimum_cents integer not null default 0 check(minimum_cents between 0 and 1000000);
alter table public.trips
  add column fare_cents integer check(fare_cents > 0),
  add column currency text check(currency='USD'),
  add column distance_meters integer check(distance_meters > 0),
  add column duration_seconds integer check(duration_seconds >= 0),
  add column quote_id uuid unique;
create table private.fare_key(id integer primary key check(id=1), secret text not null);
alter table private.fare_key enable row level security;
revoke all on private.fare_key from public,anon,authenticated;
insert into private.fare_key values(1,encode(extensions.gen_random_bytes(32),'hex'));
create function private.insert_quoted_trip(payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare q jsonb; secret text; signed_text text := payload->>'quote';
begin
  if auth.uid() is null or signed_text is null or length(signed_text)>4096 then raise exception 'Cotizacion requerida'; end if;
  select k.secret into strict secret from private.fare_key k where id=1;
  if encode(extensions.hmac(signed_text,secret,'sha256'),'hex') is distinct from payload->>'signature' then raise exception 'Cotizacion invalida'; end if;
  q := signed_text::jsonb;
  if (q->>'user_id')::uuid is distinct from auth.uid() or q->>'currency' is distinct from 'USD'
     or (q->>'expires_at')::bigint is null or (q->>'expires_at')::bigint <= extract(epoch from now())
     or (q->>'expires_at')::bigint > extract(epoch from now())+301 then raise exception 'Cotizacion vencida'; end if;
  insert into public.trips(passenger_id,origin,destination,zone,fare_cents,currency,distance_meters,duration_seconds,quote_id)
  values(auth.uid(),q->>'origin',q->>'destination',null,(q->>'fare_cents')::integer,'USD',(q->>'distance_meters')::integer,(q->>'duration_seconds')::integer,(q->>'id')::uuid);
end;$$;
revoke all on function private.insert_quoted_trip(jsonb) from public,anon,authenticated;
do $migration$
declare definition text;
begin
  select pg_get_functiondef('private.operate(text,jsonb)'::regprocedure) into definition;
  if position('insert into public.trips(passenger_id,origin,destination,zone)' in definition)=0 then raise exception 'Unexpected request function'; end if;
  definition := replace(definition,
    'insert into public.trips(passenger_id,origin,destination,zone) values(uid,trim(payload->>''origin''),trim(payload->>''destination''),null);',
    'perform private.insert_quoted_trip(payload);');
  definition := replace(definition,
    'elsif action=''settings'' then',
    'elsif action=''fares'' then
      if p.role<>''admin'' then raise exception ''No autorizado'';end if;
      update public.service_settings set base_cents=(payload->>''base_cents'')::integer,per_km_cents=(payload->>''per_km_cents'')::integer,minimum_cents=(payload->>''minimum_cents'')::integer where id=1;
     elsif action=''settings'' then');
  execute definition;
end;$migration$;
