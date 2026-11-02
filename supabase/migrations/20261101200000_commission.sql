-- Comisión de De1na: porcentaje configurable que se descuenta de cada viaje cobrado por la app al acreditar al conductor.
-- Opcional: en viajes en efectivo (el conductor cobra todo) se le carga la comisión como deuda con De1na.
alter table public.service_settings
 add column commission_percent numeric(5,2) not null default 0 check (commission_percent between 0 and 100),
 add column commission_on_cash boolean not null default false;
alter table private.driver_ledger add column fare_cents integer, add column commission_cents integer not null default 0;
alter table private.driver_ledger drop constraint driver_ledger_kind_check;
alter table private.driver_ledger add constraint driver_ledger_kind_check check (kind in ('trip_credit', 'payout', 'adjustment', 'commission'));
create unique index driver_ledger_commission_once on private.driver_ledger(trip_id) where kind = 'commission';
update private.driver_ledger l set fare_cents = l.amount_cents where kind = 'trip_credit';

create or replace function private.credit_driver_trip() returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.service_settings; fee integer;
begin
 if new.status <> 'finished' or new.driver_id is null or coalesce(new.fare_cents, 0) <= 0 then return new; end if;
 select * into s from public.service_settings where id = 1;
 fee := round(new.fare_cents * coalesce(s.commission_percent, 0) / 100.0);
 if new.payment_status = 'verified' and new.payment_method in ('pago_movil', 'binance', 'wallet') then
  if new.fare_cents - fee > 0 then
   insert into private.driver_ledger(driver_id, amount_cents, kind, trip_id, method, note, fare_cents, commission_cents)
   values(new.driver_id, new.fare_cents - fee, 'trip_credit', new.id, new.payment_method,
          case when fee > 0 then 'Comisión De1na ' || trim(to_char(s.commission_percent, 'FM990.##')) || '%' else 'Viaje cobrado por la app' end, new.fare_cents, fee)
   on conflict do nothing;
  end if;
 elsif new.payment_method = 'cash' and s.commission_on_cash and fee > 0 and old.status is distinct from 'finished' then
  insert into private.driver_ledger(driver_id, amount_cents, kind, trip_id, method, note, fare_cents, commission_cents)
  values(new.driver_id, -fee, 'commission', new.id, 'cash', 'Comisión De1na ' || trim(to_char(s.commission_percent, 'FM990.##')) || '% · viaje en efectivo', new.fare_cents, fee)
  on conflict do nothing;
 end if;
 return new;
end $$;

create or replace function private.earnings_of(driver uuid) returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'balance_cents', private.driver_balance(driver),
  'earned_cents', coalesce((select sum(amount_cents) from private.driver_ledger where driver_id = driver and kind = 'trip_credit'), 0),
  'paid_cents', coalesce((select -sum(amount_cents) from private.driver_ledger where driver_id = driver and kind = 'payout'), 0),
  'commission_cents', coalesce((select sum(commission_cents) from private.driver_ledger where driver_id = driver), 0),
  'movements', coalesce((select jsonb_agg(m order by m.created_at desc) from (
    select l.id, l.amount_cents, l.kind, l.trip_id, l.method, l.reference, l.note, l.created_at, l.fare_cents, l.commission_cents, t.destination
    from private.driver_ledger l left join public.trips t on t.id = l.trip_id
    where l.driver_id = driver order by l.created_at desc limit 200) m), '[]'::jsonb))
$$;

create function private.admin_commission(commission_percent numeric, commission_on_cash boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 if commission_percent is null or commission_percent < 0 or commission_percent > 100 then raise exception 'Porcentaje inválido'; end if;
 update public.service_settings s set commission_percent = round(admin_commission.commission_percent, 2), commission_on_cash = coalesce(admin_commission.commission_on_cash, false) where s.id = 1;
end $$;
revoke all on function private.admin_commission(numeric, boolean) from public, anon;
grant execute on function private.admin_commission(numeric, boolean) to authenticated;
create function public.admin_commission(commission_percent numeric, commission_on_cash boolean) returns void language sql security invoker set search_path = '' as $$ select private.admin_commission(commission_percent, commission_on_cash) $$;
revoke all on function public.admin_commission(numeric, boolean) from public, anon;
grant execute on function public.admin_commission(numeric, boolean) to authenticated;
