create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create function private.catalog_normalize(value text) returns text language sql stable set search_path='' as $$
 select btrim(regexp_replace(regexp_replace(lower(extensions.unaccent(coalesce(value,''))),'[^[:alnum:] ]',' ','g'),'[[:space:]]+',' ','g'))
$$;
revoke all on function private.catalog_normalize(text) from public,anon,authenticated;

create table private.catalog_places (
 id uuid primary key default gen_random_uuid(),
 source text not null check(source ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
 external_id text not null check(length(btrim(external_id)) between 1 and 160),
 name text not null check(length(btrim(name)) between 1 and 110),
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 aliases text[] not null default '{}' check(cardinality(aliases)<=10),
 address text not null default '' check(length(address)<=200),
 municipality text not null default '' check(length(municipality)<=100),
 category text not null default '' check(length(category)<=60),
 reference text not null default '' check(length(reference)<=240),
 source_url text not null default '' check(length(source_url)<=2048 and (source_url='' or source_url ~ '^https?://[^[:space:]]+$')),
 active boolean not null default true,
 name_key text not null default '', search_text text not null default '',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id) on delete set null,
 unique(source,external_id)
);
create index catalog_search_text on private.catalog_places using gin(search_text extensions.gin_trgm_ops);
create index catalog_name_key on private.catalog_places using gin(name_key extensions.gin_trgm_ops);
create index catalog_updated on private.catalog_places(updated_at desc,id);
create index catalog_updated_by on private.catalog_places(updated_by);
create table private.catalog_batches (
 id uuid primary key,actor uuid not null references public.profiles(id) on delete cascade,
 payload_hash text not null,result jsonb not null,created_at timestamptz not null default now()
);
create index catalog_batches_actor on private.catalog_batches(actor);
alter table private.catalog_places enable row level security;
alter table private.catalog_batches enable row level security;
revoke all on private.catalog_places,private.catalog_batches from public,anon,authenticated;

create function private.catalog_prepare() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from unnest(new.aliases) a where a is null or length(btrim(a)) not between 1 and 80) then raise exception 'Alias invalido';end if;
 new.name_key:=private.catalog_normalize(new.name);
 new.search_text:=private.catalog_normalize(concat_ws(' ',new.name,array_to_string(new.aliases,' '),new.address,new.municipality,new.category,new.reference));
 new.updated_at:=now();
 return new;
end;$$;
revoke all on function private.catalog_prepare() from public,anon,authenticated;
create trigger catalog_prepare before insert or update on private.catalog_places for each row execute function private.catalog_prepare();

create function private.catalog_search(search_query text,center_lat double precision,center_lng double precision) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q text:=private.catalog_normalize(search_query);lat double precision:=center_lat;lng double precision:=center_lng;result jsonb;
begin
 if auth.uid() is null then raise exception 'Inicia sesion';end if;
 if length(q)<3 or length(q)>120 then return '[]'::jsonb;end if;
 if lat is null or lng is null or not(lat between 8.3 and 12.6 and lng between -73.5 and -70.5) then lat:=11.087;lng:= -71.603;end if;
 select coalesce(jsonb_agg(row_to_json(p)),'[]'::jsonb) into result from (
  select c.id,c.name,c.latitude,c.longitude,c.address,c.municipality,c.reference
  from private.catalog_places c
  where c.active and c.latitude between 8.3 and 12.6 and c.longitude between -73.5 and -70.5
   and (c.search_text like '%'||q||'%' or c.name_key operator(extensions.%) q)
  order by case when c.name_key=q or exists(select 1 from unnest(c.aliases) a where private.catalog_normalize(a)=q) then 0
                when c.name_key like q||'%' then 1 when c.search_text like '%'||q||'%' then 2 else 3 end,
   power(c.latitude-lat,2)+power((c.longitude-lng)*cos(radians(lat)),2),
   extensions.similarity(c.name_key,q) desc,c.id limit 8
 )p;
 return result;
end;$$;
revoke all on function private.catalog_search(text,double precision,double precision) from public,anon;
grant execute on function private.catalog_search(text,double precision,double precision) to authenticated;
create function public.catalog_search(search_query text,center_lat double precision default null,center_lng double precision default null) returns jsonb
language sql security invoker set search_path='' as $$select private.catalog_search(search_query,center_lat,center_lng)$$;
revoke all on function public.catalog_search(text,double precision,double precision) from public,anon;
grant execute on function public.catalog_search(text,double precision,double precision) to authenticated;

create function private.catalog_admin(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();q text;page integer;result jsonb;items jsonb;item jsonb;existing private.catalog_places;
 batch uuid;fingerprint text;previous private.catalog_batches;inserted integer:=0;updated integer:=0;i integer:=0;k text;
begin
 if uid is null or (select role from public.profiles where id=uid) is distinct from 'admin' then raise exception 'Solo administradores';end if;
 if action='list' then
  q:=private.catalog_normalize(left(coalesce(payload->>'query',''),120));
  page:=greatest(0,least(100000,coalesce((payload->>'page')::integer,0)));
  select coalesce(jsonb_agg(row_to_json(p)),'[]'::jsonb) into items from (
   select id,source,external_id,name,latitude,longitude,aliases,address,municipality,category,reference,source_url,active,updated_at
   from private.catalog_places where q='' or search_text like '%'||q||'%' order by updated_at desc,id limit 25 offset page*25
  )p;
  select jsonb_build_object('items',items,'total',count(*),'active',count(*) filter(where active)) into result from private.catalog_places where q='' or search_text like '%'||q||'%';
  return result;
 elsif action='toggle' then
  update private.catalog_places set active=(payload->>'active')::boolean,updated_by=uid where id=(payload->>'id')::uuid;
  if not found then raise exception 'Lugar no encontrado';end if;
  return '{}'::jsonb;
 elsif action<>'import' then raise exception 'Accion invalida';end if;
 if payload->'version' is distinct from '1'::jsonb or jsonb_typeof(payload->'places') is distinct from 'array' then raise exception 'Formato invalido: version 1 y places requerido';end if;
 if jsonb_array_length(payload->'places') not between 1 and 100 then raise exception 'Cada lote admite entre 1 y 100 lugares';end if;
 batch:=(payload->>'batch_id')::uuid;
 if batch is null then raise exception 'batch_id requerido';end if;
 fingerprint:=encode(extensions.digest((payload-'batch_id')::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(4173003);
 select * into previous from private.catalog_batches where id=batch;
 if previous.id is not null then
  if previous.actor<>uid or previous.payload_hash<>fingerprint then raise exception 'batch_id ya utilizado con otros datos';end if;
  return previous.result;
 end if;
 if exists(select 1 from jsonb_array_elements(payload->'places') p group by btrim(p->>'source'),btrim(p->>'external_id') having count(*)>1) then raise exception 'Identificadores repetidos en el lote';end if;
 for item in select value from jsonb_array_elements(payload->'places') loop
  i:=i+1;
  begin
   if jsonb_typeof(item)<>'object' then raise exception 'Cada lugar debe ser un objeto';end if;
   for k in select jsonb_object_keys(item) loop
    if k not in ('source','external_id','name','latitude','longitude','aliases','address','municipality','category','reference','source_url','active') then raise exception 'Campo desconocido: %',k;end if;
   end loop;
   foreach k in array array['source','external_id','name'] loop
    if jsonb_typeof(item->k) is distinct from 'string' then raise exception 'Texto requerido: %',k;end if;
   end loop;
   foreach k in array array['address','municipality','category','reference','source_url'] loop
    if item ? k and jsonb_typeof(item->k)<>'string' then raise exception 'Texto invalido: %',k;end if;
   end loop;
   if jsonb_typeof(item->'latitude') is distinct from 'number' or jsonb_typeof(item->'longitude') is distinct from 'number' then raise exception 'Coordenadas numericas requeridas';end if;
   if item ? 'active' and jsonb_typeof(item->'active')<>'boolean' then raise exception 'active debe ser booleano';end if;
   if item ? 'aliases' then
    if jsonb_typeof(item->'aliases')<>'array' then raise exception 'aliases debe ser una lista';end if;
    if exists(select 1 from jsonb_array_elements(item->'aliases') a where jsonb_typeof(a)<>'string') then raise exception 'Alias no es texto';end if;
   end if;
   select * into existing from private.catalog_places where source=btrim(item->>'source') and external_id=btrim(item->>'external_id');
   insert into private.catalog_places(source,external_id,name,latitude,longitude,aliases,address,municipality,category,reference,source_url,active,updated_by)
   values(btrim(item->>'source'),btrim(item->>'external_id'),btrim(item->>'name'),(item->>'latitude')::double precision,(item->>'longitude')::double precision,
    array(select btrim(a) from jsonb_array_elements_text(coalesce(item->'aliases','[]'::jsonb)) a),
    btrim(coalesce(item->>'address','')),btrim(coalesce(item->>'municipality','')),btrim(coalesce(item->>'category','')),btrim(coalesce(item->>'reference','')),btrim(coalesce(item->>'source_url','')),
    coalesce((item->>'active')::boolean,existing.active,true),uid)
   on conflict(source,external_id) do update set name=excluded.name,latitude=excluded.latitude,longitude=excluded.longitude,aliases=excluded.aliases,address=excluded.address,municipality=excluded.municipality,category=excluded.category,reference=excluded.reference,source_url=excluded.source_url,active=excluded.active,updated_by=uid;
   if existing.id is null then inserted:=inserted+1;else updated:=updated+1;end if;
  exception when others then raise exception 'Lugar %: %',i,sqlerrm;
  end;
 end loop;
 result:=jsonb_build_object('processed',i,'inserted',inserted,'updated',updated);
 insert into private.catalog_batches(id,actor,payload_hash,result) values(batch,uid,fingerprint,result);
 return result;
end;$$;
revoke all on function private.catalog_admin(text,jsonb) from public,anon;
grant execute on function private.catalog_admin(text,jsonb) to authenticated;
create function public.catalog_admin(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.catalog_admin(action,payload)$$;
revoke all on function public.catalog_admin(text,jsonb) from public,anon;
grant execute on function public.catalog_admin(text,jsonb) to authenticated;
