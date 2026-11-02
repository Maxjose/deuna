-- Aviso a conductores: «sin comisión» cuando la comisión está desactivada y la administración lo activa.
alter table public.service_settings add column commission_promo boolean not null default false;
create or replace function private.admin_commission(payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare pct numeric := (payload->>'commission_percent')::numeric;
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 if pct is null or pct < 0 or pct > 100 then raise exception 'Porcentaje inválido'; end if;
 update public.service_settings s set commission_percent = round(pct, 2),
  commission_enabled = coalesce((payload->>'commission_enabled')::boolean, s.commission_enabled),
  commission_on_pago_movil = coalesce((payload->>'commission_on_pago_movil')::boolean, s.commission_on_pago_movil),
  commission_on_binance = coalesce((payload->>'commission_on_binance')::boolean, s.commission_on_binance),
  commission_on_wallet = coalesce((payload->>'commission_on_wallet')::boolean, s.commission_on_wallet),
  commission_on_cash = coalesce((payload->>'commission_on_cash')::boolean, s.commission_on_cash),
  commission_promo = coalesce((payload->>'commission_promo')::boolean, s.commission_promo)
 where s.id = 1;
end $$;
