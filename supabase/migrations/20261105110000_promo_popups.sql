-- Promociones emergentes: imagen + enlace que la administración publica. Cada usuario la ve una sola vez
-- por publicación; al volver a publicarla (o crear otra) aparece de nuevo.
create table public.promo_popups(
 id uuid primary key default gen_random_uuid(),
 title text not null check (length(btrim(title)) between 2 and 80),
 image_url text not null check (image_url ~ '^https://'),
 link_url text check (link_url is null or link_url ~ '^https://'),
 audience text not null default 'all' check (audience in ('all', 'passenger', 'driver')),
 active boolean not null default false,
 published_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.promo_popups enable row level security;
create table private.promo_dismissals(
 user_id uuid not null references auth.users(id) on delete cascade,
 promo_id uuid not null references public.promo_popups(id) on delete cascade,
 published_at timestamptz not null,
 dismissed_at timestamptz not null default now(),
 primary key (user_id, promo_id, published_at)
);

-- La promoción más reciente activa para el usuario que no haya cerrado en esta publicación.
create function private.my_promo() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r text;
begin
 if auth.uid() is null then return null; end if;
 select role into r from public.profiles where id = auth.uid();
 return (select jsonb_build_object('id', p.id, 'title', p.title, 'image_url', p.image_url, 'link_url', p.link_url, 'published_at', p.published_at)
  from public.promo_popups p
  where p.active and p.published_at is not null and (p.audience = 'all' or (p.audience = 'driver' and r = 'driver') or (p.audience = 'passenger' and r = 'passenger'))
   and not exists (select 1 from private.promo_dismissals d where d.user_id = auth.uid() and d.promo_id = p.id and d.published_at = p.published_at)
  order by p.published_at desc limit 1);
end $$;
create function private.dismiss_promo(promo_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'No autorizado'; end if;
 insert into private.promo_dismissals(user_id, promo_id, published_at)
 select auth.uid(), p.id, p.published_at from public.promo_popups p where p.id = dismiss_promo.promo_id and p.published_at is not null
 on conflict do nothing;
end $$;

-- Administración.
create function private.admin_promos() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 return coalesce((select jsonb_agg(x order by x.created_at desc) from (
  select p.*, (select count(*) from private.promo_dismissals d where d.promo_id = p.id and d.published_at = p.published_at) as views
  from public.promo_popups p) x), '[]'::jsonb);
end $$;
create function private.admin_promo_save(payload jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid := nullif(payload->>'id', '')::uuid; link text := nullif(btrim(coalesce(payload->>'link_url', '')), '');
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 if link is not null and link !~ '^https://' then raise exception 'Enlace inválido'; end if;
 if pid is null then
  insert into public.promo_popups(title, image_url, link_url, audience) values(btrim(payload->>'title'), payload->>'image_url', link, coalesce(payload->>'audience', 'all')) returning id into pid;
 else
  update public.promo_popups set title = btrim(payload->>'title'), image_url = payload->>'image_url', link_url = link, audience = coalesce(payload->>'audience', audience) where id = pid;
 end if;
 return pid;
end $$;
-- Publicar (o volver a publicar) reinicia quién la ha visto; despublicar la oculta.
create function private.admin_promo_publish(promo_id uuid, publish boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 update public.promo_popups set active = publish, published_at = case when publish then clock_timestamp() else published_at end where id = admin_promo_publish.promo_id;
end $$;
create function private.admin_promo_delete(promo_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 delete from public.promo_popups where id = admin_promo_delete.promo_id;
end $$;

do $$declare f text;begin
 foreach f in array array['my_promo()', 'dismiss_promo(uuid)', 'admin_promos()', 'admin_promo_save(jsonb)', 'admin_promo_publish(uuid,boolean)', 'admin_promo_delete(uuid)'] loop
  execute format('revoke all on function private.%s from public, anon', f);
  execute format('grant execute on function private.%s to authenticated', f);
 end loop;
end $$;
create function public.my_promo() returns jsonb language sql security invoker set search_path = '' as $$ select private.my_promo() $$;
create function public.dismiss_promo(promo_id uuid) returns void language sql security invoker set search_path = '' as $$ select private.dismiss_promo(promo_id) $$;
create function public.admin_promos() returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_promos() $$;
create function public.admin_promo_save(payload jsonb) returns uuid language sql security invoker set search_path = '' as $$ select private.admin_promo_save(payload) $$;
create function public.admin_promo_publish(promo_id uuid, publish boolean) returns void language sql security invoker set search_path = '' as $$ select private.admin_promo_publish(promo_id, publish) $$;
create function public.admin_promo_delete(promo_id uuid) returns void language sql security invoker set search_path = '' as $$ select private.admin_promo_delete(promo_id) $$;
do $$declare f text;begin
 foreach f in array array['my_promo()', 'dismiss_promo(uuid)', 'admin_promos()', 'admin_promo_save(jsonb)', 'admin_promo_publish(uuid,boolean)', 'admin_promo_delete(uuid)'] loop
  execute format('revoke all on function public.%s from public, anon', f);
  execute format('grant execute on function public.%s to authenticated', f);
 end loop;
end $$;

-- Imágenes: bucket público de lectura; solo administración sube, cambia o borra.
do $$begin
 if to_regclass('storage.buckets') is null then return; end if;
 insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
 values('promos', 'promos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']) on conflict (id) do nothing;
 execute $p$create policy "promos admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'promos' and exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin' and not pr.suspended))$p$;
 execute $p$create policy "promos admin update" on storage.objects for update to authenticated using (bucket_id = 'promos' and exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin' and not pr.suspended))$p$;
 execute $p$create policy "promos admin delete" on storage.objects for delete to authenticated using (bucket_id = 'promos' and exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin' and not pr.suspended))$p$;
end $$;
