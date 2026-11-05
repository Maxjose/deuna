-- Método de pago «Viaje de prueba» para tests: se activa desde administración, no genera ingresos ni comisiones
-- (no crea movimientos de ganancias ni saldo pendiente) y queda registrado como viaje de prueba.
alter table public.service_settings add column test_trips_enabled boolean not null default false;
alter table public.trips drop constraint trips_payment_method_check;
alter table public.trips add constraint trips_payment_method_check check (payment_method in ('cash', 'pago_movil', 'wallet', 'binance', 'test'));

do $$declare definition text; patched text;begin
 select pg_get_functiondef('private.insert_quoted_trip(jsonb)'::regprocedure) into definition;
 patched := replace(definition, 'if s.billing_mode = ''subscription'' and method not in (''cash'', ''pago_movil'') then',
  'if method = ''test'' and not s.test_trips_enabled then raise exception ''Viaje de prueba no disponible''; end if;' || chr(10) ||
  '  if s.billing_mode = ''subscription'' and method not in (''cash'', ''pago_movil'', ''test'') then');
 if patched = definition then raise exception 'Missing subscription method check'; end if;
 patched := replace(patched, 'if method not in (''cash'', ''pago_movil'', ''wallet'', ''binance'') then',
  'if method not in (''cash'', ''pago_movil'', ''wallet'', ''binance'', ''test'') then');
 if position('''binance'', ''test'')' in patched) = 0 then raise exception 'Missing method list'; end if;
 execute patched;
end $$;

-- Queda marcado al crearse.
create function private.mark_test_trip() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.payment_method = 'test' then new.payment_note := 'Viaje de prueba · sin cobro'; end if;
 return new;
end $$;
revoke all on function private.mark_test_trip() from public, anon, authenticated;
create trigger mark_test_trip before insert on public.trips for each row execute function private.mark_test_trip();

create function private.admin_test_trips(enabled boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 update public.service_settings set test_trips_enabled = coalesce(admin_test_trips.enabled, false) where id = 1;
end $$;
revoke all on function private.admin_test_trips(boolean) from public, anon;
grant execute on function private.admin_test_trips(boolean) to authenticated;
create function public.admin_test_trips(enabled boolean) returns void language sql security invoker set search_path = '' as $$ select private.admin_test_trips(enabled) $$;
revoke all on function public.admin_test_trips(boolean) from public, anon;
grant execute on function public.admin_test_trips(boolean) to authenticated;
