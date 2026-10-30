create table public.favorite_places (
 user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('home','work')),
 label text not null check(length(btrim(label)) between 1 and 110),
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 primary key(user_id,kind)
);
alter table public.favorite_places enable row level security;
revoke all on public.favorite_places from public,anon,authenticated;
grant select,insert,update,delete on public.favorite_places to authenticated;
create policy favorites_select on public.favorite_places for select to authenticated using(user_id=(select auth.uid()));
create policy favorites_insert on public.favorite_places for insert to authenticated with check(user_id=(select auth.uid()));
create policy favorites_update on public.favorite_places for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy favorites_delete on public.favorite_places for delete to authenticated using(user_id=(select auth.uid()));
