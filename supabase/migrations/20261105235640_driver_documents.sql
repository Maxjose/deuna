create table private.driver_documents (
 driver_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('circulation','liability','quarters','license','medical')),
 path text not null unique,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reason text not null default '' check(length(reason)<=500),
 uploaded_at timestamptz not null default now(), reviewed_at timestamptz,
 reviewed_by uuid references public.profiles(id) on delete set null,
 primary key(driver_id,kind)
);
create table private.driver_document_exemptions (
 driver_id uuid primary key references public.profiles(id) on delete cascade,
 enabled boolean not null default false,
 changed_by uuid references public.profiles(id) on delete set null,
 changed_at timestamptz not null default now()
);
alter table private.driver_documents enable row level security;
alter table private.driver_document_exemptions enable row level security;
revoke all on private.driver_documents,private.driver_document_exemptions from public,anon,authenticated;

create function private.documents_ready(driver uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select enabled from private.driver_document_exemptions where driver_id=driver),false)
 or (select count(*)=5 from private.driver_documents d join storage.objects o on o.bucket_id='driver-documents' and o.name=d.path where d.driver_id=driver and d.status='approved')
$$;
revoke all on function private.documents_ready(uuid) from public,anon,authenticated;

-- Storage objects are immutable: replacement always uploads a new object.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('driver-documents','driver-documents',false,10485760,array['image/jpeg','image/png','application/pdf']);
create function private.document_access(path text,writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and not p.suspended and
 ((not writing and p.role='admin') or (p.role='driver' and split_part(path,'/',1)=p.id::text)))
$$;
revoke all on function private.document_access(text,boolean) from public,anon;
grant execute on function private.document_access(text,boolean) to authenticated;
create policy "driver documents read" on storage.objects for select to authenticated using(bucket_id='driver-documents' and private.document_access(name));
create policy "driver documents upload" on storage.objects for insert to authenticated with check(bucket_id='driver-documents' and private.document_access(name,true) and name ~ '^[0-9a-f-]{36}/(circulation|liability|quarters|license|medical)/[0-9a-f-]{36}\.(jpg|png|pdf)$');
create function private.document_unused(path text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.driver_documents d where d.path=$1)
$$;
revoke all on function private.document_unused(text) from public,anon;
grant execute on function private.document_unused(text) to authenticated;
create policy "driver documents cleanup" on storage.objects for delete to authenticated using(bucket_id='driver-documents' and private.document_access(name,true) and private.document_unused(name));

create function private.driver_documents_api(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();p public.profiles;target uuid;doc private.driver_documents;file_path text;doc_kind text;
begin
 if uid is null then raise exception 'No autorizado';end if;
 perform pg_advisory_xact_lock(4173001);
 select * into strict p from public.profiles where id=uid;
 if p.suspended or p.role not in ('driver','admin') then raise exception 'No autorizado';end if;
 target:=case when p.role='admin' then (payload->>'driver_id')::uuid else uid end;
 if not exists(select 1 from public.profiles where id=target and role='driver') then raise exception 'Conductor no encontrado';end if;
 if action='submit' then
  if p.role<>'driver' then raise exception 'No autorizado';end if;
  file_path:=payload->>'path';doc_kind:=payload->>'kind';
  if split_part(file_path,'/',1) is distinct from uid::text or split_part(file_path,'/',2) is distinct from doc_kind then raise exception 'Archivo invalido';end if;
  if not exists(select 1 from storage.objects where bucket_id='driver-documents' and name=file_path and (metadata->>'size')::bigint between 1 and 10485760 and metadata->>'mimetype' in ('image/jpeg','image/png','application/pdf')) then raise exception 'Archivo invalido';end if;
  insert into private.driver_documents(driver_id,kind,path) values(uid,doc_kind,file_path)
  on conflict(driver_id,kind) do update set path=excluded.path,status='pending',reason='',uploaded_at=now(),reviewed_at=null,reviewed_by=null;
 elsif action='review' then
  if p.role<>'admin' then raise exception 'No autorizado';end if;
  if jsonb_typeof(payload->'approve') is distinct from 'boolean' then raise exception 'Estado requerido';end if;
  if not (payload->>'approve')::boolean and length(btrim(coalesce(payload->>'reason','')))<3 then raise exception 'Motivo requerido';end if;
  update private.driver_documents set status=case when (payload->>'approve')::boolean then 'approved' else 'rejected' end,
   reason=case when (payload->>'approve')::boolean then '' else left(btrim(payload->>'reason'),500) end,reviewed_at=now(),reviewed_by=uid
   where driver_id=target and kind=payload->>'kind' and path=payload->>'path' returning * into doc;
  if not found then raise exception 'Documento actualizado';end if;
 elsif action='exempt' then
  if p.role<>'admin' then raise exception 'No autorizado';end if;
  if jsonb_typeof(payload->'enabled') is distinct from 'boolean' then raise exception 'Estado requerido';end if;
  insert into private.driver_document_exemptions(driver_id,enabled,changed_by) values(target,(payload->>'enabled')::boolean,uid)
  on conflict(driver_id) do update set enabled=excluded.enabled,changed_by=uid,changed_at=now();
 elsif action<>'list' then raise exception 'Accion invalida';
 end if;
 if action<>'list' and not private.documents_ready(target) then
  update public.profiles set available=false where id=target and available and not exists(select 1 from public.trips where driver_id=target and status in ('assigned','arrived','ongoing'));
 end if;
 return jsonb_build_object('ready',private.documents_ready(target),'exempt',coalesce((select enabled from private.driver_document_exemptions where driver_id=target),false),
 'documents',coalesce((select jsonb_agg(to_jsonb(d)-'driver_id' order by kind) from private.driver_documents d where driver_id=target),'[]'::jsonb));
end $$;
revoke all on function private.driver_documents_api(text,jsonb) from public,anon;
grant execute on function private.driver_documents_api(text,jsonb) to authenticated;
create function public.driver_documents(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.driver_documents_api(action,payload)$$;
revoke all on function public.driver_documents(text,jsonb) from public,anon;
grant execute on function public.driver_documents(text,jsonb) to authenticated;

-- Guard the authoritative entry points, including VIP and already connected drivers.
do $migration$
declare definition text;changed text;signature text;
begin
 select pg_get_functiondef('private.operate(text,jsonb)'::regprocedure) into definition;
 changed:=replace(definition,'if p.suspended then raise exception ''Cuenta suspendida'';end if;',
 'if p.suspended then raise exception ''Cuenta suspendida'';end if;
 if p.role=''driver'' and (action=''accept'' or (action=''available'' and coalesce((payload->>''available'')::boolean,false))) and not private.documents_ready(uid) then raise exception ''Documentos pendientes'';end if;');
 if changed=definition then raise exception 'Missing operate guard';end if;execute changed;
 select pg_get_functiondef('private.can_receive()'::regprocedure) into definition;
 execute replace(definition,'and not private.plan_blocked(auth.uid())','and not private.plan_blocked(auth.uid()) and private.documents_ready(auth.uid())');
 foreach signature in array array['private.queue_trip_push()','private.push_worker(text,text,jsonb)','private.service_is_open(time)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  changed:=replace(definition,'p.approved and p.available','p.approved and p.available and private.documents_ready(p.id)');
  if changed=definition then raise exception 'Missing document insertion point: %',signature;end if;
  execute changed;
 end loop;
end $migration$;
update public.profiles p set available=false where role='driver' and available and not exists(select 1 from public.trips where driver_id=p.id and status in ('assigned','arrived','ongoing'));
