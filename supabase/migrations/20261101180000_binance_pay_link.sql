-- Enlace de cobro de Binance (abre la app con el receptor cargado) y su QR para el pasajero.
alter table public.service_settings add column binance_pay_link text check (binance_pay_link ~ '^https://(app|s)\.binance\.com/[A-Za-z0-9/_?=&.-]{3,200}$');
update public.service_settings set binance_pay_link = 'https://app.binance.com/uni-qr/48bSQYby' where id = 1;
drop function public.admin_payment_methods(boolean, boolean, text);
drop function private.admin_payment_methods(boolean, boolean, text);
create function private.admin_payment_methods(pago_movil_enabled boolean, binance_enabled boolean, binance_pay_id text, binance_pay_link text default null) returns void language plpgsql security definer set search_path = '' as $$
declare pay_id text := nullif(regexp_replace(coalesce(binance_pay_id, ''), '[^0-9]', '', 'g'), ''); link text := nullif(btrim(coalesce(binance_pay_link, '')), '');
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 if binance_enabled and pay_id is null then raise exception 'Falta el Pay ID'; end if;
 if pay_id is not null and pay_id !~ '^[0-9]{5,15}$' then raise exception 'Pay ID inválido'; end if;
 if link is not null and link !~ '^https://(app|s)\.binance\.com/[A-Za-z0-9/_?=&.-]{3,200}$' then raise exception 'Enlace inválido'; end if;
 update public.service_settings s set pago_movil_enabled = coalesce(admin_payment_methods.pago_movil_enabled, true),
  binance_enabled = coalesce(admin_payment_methods.binance_enabled, false), binance_pay_id = pay_id, binance_pay_link = link where s.id = 1;
end $$;
revoke all on function private.admin_payment_methods(boolean, boolean, text, text) from public, anon;
grant execute on function private.admin_payment_methods(boolean, boolean, text, text) to authenticated;
create function public.admin_payment_methods(pago_movil_enabled boolean, binance_enabled boolean, binance_pay_id text, binance_pay_link text default null) returns void language sql security invoker set search_path = '' as $$ select private.admin_payment_methods(pago_movil_enabled, binance_enabled, binance_pay_id, binance_pay_link) $$;
revoke all on function public.admin_payment_methods(boolean, boolean, text, text) from public, anon;
grant execute on function public.admin_payment_methods(boolean, boolean, text, text) to authenticated;
