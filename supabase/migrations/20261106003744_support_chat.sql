create table private.support_threads (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 subject text not null check(length(subject) between 5 and 2000),
 status text not null default 'waiting' check(status in ('waiting','active','resolved')),
 assigned_to uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 user_read bigint not null default 0,admin_read bigint not null default 0
);
create unique index support_one_open on private.support_threads(user_id) where status<>'resolved';
create index support_queue on private.support_threads(status,updated_at desc);
create table private.support_messages (
 seq bigint generated always as identity primary key,id uuid not null unique,
 thread_id uuid not null references private.support_threads(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade,
 staff boolean not null,body text not null check(length(body) between 1 and 2000),created_at timestamptz not null default now()
);
create index support_messages_thread on private.support_messages(thread_id,seq desc);
alter table private.support_threads enable row level security;
alter table private.support_messages enable row level security;
revoke all on private.support_threads,private.support_messages from public,anon,authenticated;
create function private.support_api(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();actor public.profiles;t private.support_threads;is_staff boolean;message_text text;result jsonb;rows jsonb;before_seq bigint;last_seq bigint;mid uuid;
begin
 if uid is null then raise exception 'No autorizado';end if;
 select * into strict actor from public.profiles where id=uid;
 is_staff:=actor.role='admin' and not actor.suspended;
 if actor.role='admin' and not is_staff then raise exception 'No autorizado';end if;
 -- Serialize ownership, assignment and sends, just like trip mutations in the pilot.
 perform pg_advisory_xact_lock(4173001);
 if action='request' then
  if is_staff then raise exception 'Solo usuarios';end if;
  select * into t from private.support_threads where user_id=uid and status<>'resolved';
  if found then return jsonb_build_object('id',t.id);end if;
  message_text:=btrim(coalesce(payload->>'subject',''));
  if length(message_text) not between 5 and 2000 then raise exception 'Motivo requerido';end if;
  if (select count(*) from private.support_threads where user_id=uid and created_at>now()-interval '1 day')>=5 then raise exception 'Limite de solicitudes';end if;
  insert into private.support_threads(user_id,subject) values(uid,message_text) returning * into t;
  return jsonb_build_object('id',t.id);
 elsif action='list' then
  select coalesce(jsonb_agg(x order by x.updated_at desc,x.id),'[]') into rows from (
   select st.id,st.subject,st.status,st.assigned_to,st.updated_at,st.user_id,
    coalesce(nullif(u.raw_user_meta_data->>'display_name',''),u.email,'Usuario') as name,p.role,
    (select count(*) from private.support_messages m where m.thread_id=st.id and m.staff<>is_staff and m.seq>case when is_staff then st.admin_read else st.user_read end) as unread
   from private.support_threads st join public.profiles p on p.id=st.user_id join auth.users u on u.id=st.user_id
   where (is_staff or st.user_id=uid) and (not is_staff or coalesce(payload->>'status','waiting')='all' or st.status=payload->>'status')
   and (not is_staff or position(lower(left(coalesce(payload->>'search',''),120)) in lower(coalesce(u.email,'')||' '||coalesce(u.raw_user_meta_data->>'display_name','')||' '||st.subject))>0)
   order by st.updated_at desc,st.id limit 20 offset least(greatest(coalesce((payload->>'page')::integer,0),0),10000)*20
  )x;
  return jsonb_build_object('items',rows);
 end if;
 select * into t from private.support_threads where id=(payload->>'id')::uuid for update;
 if not found or (not is_staff and t.user_id<>uid) then raise exception 'No autorizado';end if;
 if action='claim' then
  if not is_staff or (t.status<>'waiting' and not(t.status='active' and t.assigned_to=uid)) then raise exception 'Conversacion no disponible';end if;
  update private.support_threads set assigned_to=uid,status='active',updated_at=now() where id=t.id;
 elsif action in ('resolve','release') then
  if not is_staff or t.status<>'active' or t.assigned_to is distinct from uid then raise exception 'No autorizado';end if;
  update private.support_threads set status=case when action='resolve' then 'resolved' else 'waiting' end,
   assigned_to=case when action='release' then null else assigned_to end,updated_at=now() where id=t.id;
 elsif action='cancel' then
  if is_staff or t.user_id<>uid or t.status<>'waiting' then raise exception 'No autorizado';end if;
  update private.support_threads set status='resolved',updated_at=now() where id=t.id;
 elsif action='send' then
  if t.status<>'active' or (is_staff and t.assigned_to is distinct from uid) then raise exception 'Espera atencion';end if;
  message_text:=btrim(coalesce(payload->>'body',''));mid:=(payload->>'message_id')::uuid;
  if length(message_text) not between 1 and 2000 or mid is null then raise exception 'Mensaje invalido';end if;
  if exists(select 1 from private.support_messages where id=mid and (thread_id<>t.id or sender_id<>uid or message_text<>support_messages.body)) then raise exception 'Mensaje invalido';end if;
  if not exists(select 1 from private.support_messages where id=mid) then
   if (select count(*) from private.support_messages where sender_id=uid and created_at>now()-interval '1 minute')>=30 then raise exception 'Espera unos segundos';end if;
   insert into private.support_messages(id,thread_id,sender_id,staff,body) values(mid,t.id,uid,is_staff,message_text);
   update private.support_threads set updated_at=now() where id=t.id;
  end if;
 elsif action<>'fetch' then raise exception 'Accion invalida';end if;
 select * into t from private.support_threads where id=t.id;
 before_seq:=(payload->>'before')::bigint;
 select coalesce(jsonb_agg(x order by seq),'[]') into rows from (select seq,id,sender_id,staff,body,created_at from private.support_messages where thread_id=t.id and (before_seq is null or seq<before_seq) order by seq desc limit 100)x;
 if before_seq is null then
  select coalesce(max(seq),0) into last_seq from private.support_messages where thread_id=t.id;
  update private.support_threads set user_read=case when not is_staff then last_seq else user_read end,admin_read=case when is_staff then last_seq else admin_read end where id=t.id;
 end if;
 result:=jsonb_build_object('thread',to_jsonb(t)-'user_read'-'admin_read','messages',rows);
 if is_staff then
  result:=result||jsonb_build_object('profile',(select jsonb_build_object('id',p.id,'name',coalesce(nullif(u.raw_user_meta_data->>'display_name',''),u.email),'email',u.email,'phone',u.raw_user_meta_data->>'contact_phone','role',p.role,'approved',p.approved,'suspended',p.suspended,'available',p.available,
   'plan',case when p.role='driver' then jsonb_build_object('status',private.plan_state(p.id)->>'status','paid_until',private.plan_state(p.id)->>'paid_until') end,
   'documents_ready',case when p.role='driver' then private.documents_ready(p.id) end,
   'documents_exempt',coalesce((select enabled from private.driver_document_exemptions where driver_id=p.id),false),
   'active_trip',(select id from public.trips where (driver_id=p.id or passenger_id=p.id) and status in ('searching','assigned','arrived','ongoing') limit 1)) from public.profiles p join auth.users u on u.id=p.id where p.id=t.user_id));
 end if;
 return result;
end $$;
revoke all on function private.support_api(text,jsonb) from public,anon;
grant execute on function private.support_api(text,jsonb) to authenticated;
create function public.support(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.support_api(action,payload)$$;
revoke all on function public.support(text,jsonb) from public,anon;
grant execute on function public.support(text,jsonb) to authenticated;
