-- Ganancias de conductores: los viajes cobrados por la app (pago móvil, Binance o saldo) se acreditan al conductor
-- al finalizar con el pago verificado; la administración registra los pagos que le hace al conductor.
create table private.driver_ledger(
 id uuid primary key default gen_random_uuid(),
 driver_id uuid not null references auth.users(id) on delete cascade,
 amount_cents integer not null check (amount_cents <> 0),
 kind text not null check (kind in ('trip_credit', 'payout', 'adjustment')),
 trip_id uuid,
 method text,
 reference text check (length(reference) <= 80),
 note text check (length(note) <= 200),
 created_by uuid,
 created_at timestamptz not null default now()
);
create index driver_ledger_driver on private.driver_ledger(driver_id, created_at desc);
create unique index driver_ledger_trip_once on private.driver_ledger(trip_id) where kind = 'trip_credit';

create function private.driver_balance(driver uuid) returns integer language sql stable security definer set search_path = '' as $$
 select coalesce(sum(amount_cents), 0)::integer from private.driver_ledger where driver_id = driver
$$;
revoke all on function private.driver_balance(uuid) from public, anon, authenticated;

create function private.credit_driver_trip() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status = 'finished' and new.payment_status = 'verified' and new.driver_id is not null and new.fare_cents > 0
    and new.payment_method in ('pago_movil', 'binance', 'wallet') then
  insert into private.driver_ledger(driver_id, amount_cents, kind, trip_id, method, note)
  values(new.driver_id, new.fare_cents, 'trip_credit', new.id, new.payment_method, 'Viaje cobrado por la app') on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function private.credit_driver_trip() from public, anon, authenticated;
create trigger credit_driver_trip after update of status, payment_status on public.trips for each row execute function private.credit_driver_trip();

-- Viajes ya finalizados y verificados.
insert into private.driver_ledger(driver_id, amount_cents, kind, trip_id, method, note, created_at)
select t.driver_id, t.fare_cents, 'trip_credit', t.id, t.payment_method, 'Viaje cobrado por la app', coalesce(t.payment_verified_at, t.created_at)
from public.trips t where t.status = 'finished' and t.payment_status = 'verified' and t.driver_id is not null and t.fare_cents > 0
 and t.payment_method in ('pago_movil', 'binance', 'wallet')
on conflict do nothing;

create function private.earnings_of(driver uuid) returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'balance_cents', private.driver_balance(driver),
  'earned_cents', coalesce((select sum(amount_cents) from private.driver_ledger where driver_id = driver and kind = 'trip_credit'), 0),
  'paid_cents', coalesce((select -sum(amount_cents) from private.driver_ledger where driver_id = driver and kind = 'payout'), 0),
  'movements', coalesce((select jsonb_agg(m order by m.created_at desc) from (
    select l.id, l.amount_cents, l.kind, l.trip_id, l.method, l.reference, l.note, l.created_at, t.destination
    from private.driver_ledger l left join public.trips t on t.id = l.trip_id
    where l.driver_id = driver order by l.created_at desc limit 200) m), '[]'::jsonb))
$$;
revoke all on function private.earnings_of(uuid) from public, anon, authenticated;

create function private.my_earnings() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not exists (select 1 from public.profiles where id = auth.uid() and role = 'driver') then raise exception 'No autorizado'; end if;
 return private.earnings_of(auth.uid());
end $$;

create function private.admin_driver_earnings(driver_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 return private.earnings_of(driver_id) || jsonb_build_object('payout_account', (select u.raw_user_meta_data->'payout' from auth.users u where u.id = admin_driver_earnings.driver_id));
end $$;

create function private.admin_driver_payout(driver_id uuid, amount_cents integer, reference text, note text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 if amount_cents is null or amount_cents <= 0 or amount_cents > 1000000 then raise exception 'Monto inválido'; end if;
 if not exists (select 1 from public.profiles p where p.id = admin_driver_payout.driver_id and p.role = 'driver') then raise exception 'Conductor no encontrado'; end if;
 perform pg_advisory_xact_lock(hashtext('driver:' || driver_id::text));
 if amount_cents > private.driver_balance(driver_id) then raise exception 'Monto mayor al acumulado'; end if;
 insert into private.driver_ledger(driver_id, amount_cents, kind, reference, note, created_by)
 values(driver_id, -amount_cents, 'payout', nullif(left(btrim(coalesce(reference, '')), 80), ''), coalesce(nullif(left(btrim(coalesce(note, '')), 200), ''), 'Pago de De1na'), auth.uid());
 return private.admin_driver_earnings(driver_id);
end $$;

do $$declare f text;begin
 foreach f in array array['my_earnings()', 'admin_driver_earnings(uuid)', 'admin_driver_payout(uuid,integer,text,text)'] loop
  execute format('revoke all on function private.%s from public, anon', f);
  execute format('grant execute on function private.%s to authenticated', f);
 end loop;
end $$;
create function public.my_earnings() returns jsonb language sql security invoker set search_path = '' as $$ select private.my_earnings() $$;
create function public.admin_driver_earnings(driver_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_driver_earnings(driver_id) $$;
create function public.admin_driver_payout(driver_id uuid, amount_cents integer, reference text, note text) returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_driver_payout(driver_id, amount_cents, reference, note) $$;
do $$declare f text;begin
 foreach f in array array['my_earnings()', 'admin_driver_earnings(uuid)', 'admin_driver_payout(uuid,integer,text,text)'] loop
  execute format('revoke all on function public.%s from public, anon', f);
  execute format('grant execute on function public.%s to authenticated', f);
 end loop;
end $$;
