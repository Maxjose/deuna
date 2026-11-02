create table public.passenger_payment_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 bank text not null check(bank ~ '^[0-9]{4}$'),
 phone text not null check(phone ~ '^0[0-9]{10}$')
);
alter table public.passenger_payment_preferences enable row level security;
revoke all on public.passenger_payment_preferences from public,anon,authenticated;
grant select,insert,update on public.passenger_payment_preferences to authenticated;
create policy passenger_payment_preferences_own on public.passenger_payment_preferences for all to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='passenger' and not suspended))
 with check(user_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='passenger' and not suspended));
