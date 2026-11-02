-- Interruptores de comisión: general y por método de pago (pago móvil, Binance, saldo; efectivo ya existía).
alter table public.service_settings
 add column commission_enabled boolean not null default true,
 add column commission_on_pago_movil boolean not null default true,
 add column commission_on_binance boolean not null default true,
 add column commission_on_wallet boolean not null default true;

create or replace function private.credit_driver_trip() returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.service_settings; fee integer := 0; applies boolean;
begin
 if new.status <> 'finished' or new.driver_id is null or coalesce(new.fare_cents, 0) <= 0 then return new; end if;
 select * into s from public.service_settings where id = 1;
 applies := s.commission_enabled and case new.payment_method when 'pago_movil' then s.commission_on_pago_movil when 'binance' then s.commission_on_binance
  when 'wallet' then s.commission_on_wallet when 'cash' then s.commission_on_cash else false end;
 if applies then fee := round(new.fare_cents * coalesce(s.commission_percent, 0) / 100.0); end if;
 if new.payment_status = 'verified' and new.payment_method in ('pago_movil', 'binance', 'wallet') then
  if new.fare_cents - fee > 0 then
   insert into private.driver_ledger(driver_id, amount_cents, kind, trip_id, method, note, fare_cents, commission_cents)
   values(new.driver_id, new.fare_cents - fee, 'trip_credit', new.id, new.payment_method,
          case when fee > 0 then 'Comisión De1na ' || trim(to_char(s.commission_percent, 'FM990.##')) || '%' else 'Viaje cobrado por la app' end, new.fare_cents, fee)
   on conflict do nothing;
  end if;
 elsif new.payment_method = 'cash' and fee > 0 and old.status is distinct from 'finished' then
  insert into private.driver_ledger(driver_id, amount_cents, kind, trip_id, method, note, fare_cents, commission_cents)
  values(new.driver_id, -fee, 'commission', new.id, 'cash', 'Comisión De1na ' || trim(to_char(s.commission_percent, 'FM990.##')) || '% · viaje en efectivo', new.fare_cents, fee)
  on conflict do nothing;
 end if;
 return new;
end $$;

drop function public.admin_commission(numeric, boolean);
drop function private.admin_commission(numeric, boolean);
create function private.admin_commission(payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare pct numeric := (payload->>'commission_percent')::numeric;
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 if pct is null or pct < 0 or pct > 100 then raise exception 'Porcentaje inválido'; end if;
 update public.service_settings s set commission_percent = round(pct, 2),
  commission_enabled = coalesce((payload->>'commission_enabled')::boolean, s.commission_enabled),
  commission_on_pago_movil = coalesce((payload->>'commission_on_pago_movil')::boolean, s.commission_on_pago_movil),
  commission_on_binance = coalesce((payload->>'commission_on_binance')::boolean, s.commission_on_binance),
  commission_on_wallet = coalesce((payload->>'commission_on_wallet')::boolean, s.commission_on_wallet),
  commission_on_cash = coalesce((payload->>'commission_on_cash')::boolean, s.commission_on_cash)
 where s.id = 1;
end $$;
revoke all on function private.admin_commission(jsonb) from public, anon;
grant execute on function private.admin_commission(jsonb) to authenticated;
create function public.admin_commission(payload jsonb) returns void language sql security invoker set search_path = '' as $$ select private.admin_commission(payload) $$;
revoke all on function public.admin_commission(jsonb) from public, anon;
grant execute on function public.admin_commission(jsonb) to authenticated;
