-- Binance Pay (USDT) con cuenta personal: el pasajero paga a nuestro Pay ID y pega el ID de la transacción;
-- el servidor lo comprueba en el historial de Binance Pay y lo confirma aquí con la clave del trabajador.
-- También: interruptores para activar/desactivar pago móvil y Binance Pay.
alter table public.service_settings
 add column pago_movil_enabled boolean not null default true,
 add column binance_enabled boolean not null default false,
 add column binance_pay_id text check (binance_pay_id ~ '^[0-9]{5,15}$');
update public.service_settings set binance_pay_id = '65038281' where id = 1;
alter table public.trips drop constraint trips_payment_method_check;
alter table public.trips add constraint trips_payment_method_check check (payment_method in ('cash', 'pago_movil', 'wallet', 'binance'));
alter table public.trips add column binance_tx text check (binance_tx ~ '^[0-9A-Za-z]{6,64}$');

-- Cada transacción de Binance se usa una sola vez (viaje o recarga).
create table private.binance_receipts(
 transaction_id text primary key,
 user_id uuid not null,
 trip_id uuid,
 amount numeric(20,8) not null,
 currency text not null,
 transaction_time timestamptz,
 used_at timestamptz not null default now()
);

-- Solicitar con Binance o pago móvil solo si están activos.
do $$declare definition text; marker text := 'if method not in (''cash'', ''pago_movil'', ''wallet'')';begin
 select pg_get_functiondef('private.insert_quoted_trip(jsonb)'::regprocedure) into definition;
 if position(marker in definition) = 0 then raise exception 'Missing request method check'; end if;
 execute replace(definition, marker,
  'if method = ''binance'' and not exists (select 1 from public.service_settings x where x.id = 1 and x.binance_enabled and x.binance_pay_id is not null) then raise exception ''Binance Pay no disponible''; end if;' || chr(10) ||
  '  if method = ''pago_movil'' and not exists (select 1 from public.service_settings x where x.id = 1 and x.pago_movil_enabled) then raise exception ''Pago movil no disponible''; end if;' || chr(10) ||
  '  if method not in (''cash'', ''pago_movil'', ''wallet'', ''binance'')');
end $$;

-- Iniciar el viaje exige el pago de Binance verificado.
do $$declare definition text; patched text;begin
 select pg_get_functiondef('private.operate(text,jsonb)'::regprocedure) into definition;
 patched := replace(definition,
  'if t.status=''arrived'' and t.payment_method=''pago_movil'' and t.payment_reference is null then raise exception ''Falta referencia de pago'';end if;',
  'if t.status=''arrived'' and t.payment_method=''pago_movil'' and t.payment_reference is null then raise exception ''Falta referencia de pago'';end if;' || chr(10) ||
  '   if t.status=''arrived'' and t.payment_method=''binance'' and t.payment_status is distinct from ''verified'' then raise exception ''Falta pago Binance'';end if;');
 if patched = definition then raise exception 'Missing advance insertion point'; end if;
 execute patched;
end $$;

-- Saldo pendiente y reembolsos también para Binance.
create or replace function private.debt_trips(passenger uuid) returns setof public.trips language sql stable security definer set search_path = '' as $$
 select * from public.trips t
 where t.passenger_id = passenger and t.status = 'finished' and t.payment_method in ('pago_movil', 'binance')
  and t.payment_status is distinct from 'verified'
  and (t.payment_status = 'rejected' or t.created_at < now() - interval '60 minutes')
$$;
create or replace function private.wallet_refund_trip() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status = 'cancelled' and new.payment_status = 'verified' and new.payment_method in ('pago_movil', 'wallet', 'binance') and new.fare_cents > 0
    and (old.status is distinct from 'cancelled' or old.payment_status is distinct from 'verified') then
  insert into private.wallet_ledger(user_id, amount_cents, kind, trip_id, note)
  values(new.passenger_id, new.fare_cents, 'refund', new.id, 'Reembolso por viaje cancelado') on conflict do nothing;
 end if;
 return new;
end $$;
create or replace function private.wallet_settle_trip(trip_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.trips;
begin
 if uid is null then raise exception 'No autorizado'; end if;
 perform pg_advisory_xact_lock(hashtext('wallet:' || uid::text));
 select * into t from public.trips where id = wallet_settle_trip.trip_id and passenger_id = uid for update;
 if t.id is null or t.payment_method not in ('pago_movil', 'binance') or t.status <> 'finished' or t.payment_status = 'verified' then raise exception 'Este viaje no tiene saldo pendiente'; end if;
 if private.wallet_balance(uid) < t.fare_cents then raise exception 'Saldo insuficiente'; end if;
 insert into private.wallet_ledger(user_id, amount_cents, kind, trip_id, note) values(uid, -t.fare_cents, 'trip_payment', t.id, 'Pago de saldo pendiente');
 update public.trips set payment_status = 'verified', payment_verified_at = now(), payment_verified_by = 'wallet', payment_note = 'Pagado con saldo',
  payment_locked_until = null, payment_lease = null where id = t.id;
 return jsonb_build_object('balance_cents', private.wallet_balance(uid));
end $$;

-- Confirmación desde el servidor (clave del trabajador). kind: 'trip' o 'topup'.
create function private.binance_confirm(worker_key text, payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (payload->>'user_id')::uuid; tx text := payload->>'transaction_id'; amount numeric := (payload->>'amount')::numeric;
 currency text := payload->>'currency'; at timestamptz := to_timestamp((payload->>'transaction_time')::bigint / 1000.0);
 s public.service_settings; t public.trips; cents integer;
begin
 if worker_key is null or length(worker_key) <> 64 or worker_key is distinct from (select c.worker_key from private.push_config c where id = 1) then raise exception 'No autorizado'; end if;
 select * into strict s from public.service_settings where id = 1;
 if not s.binance_enabled then raise exception 'Binance Pay no disponible'; end if;
 if uid is null or tx !~ '^[0-9A-Za-z]{6,64}$' or currency <> 'USDT' or amount is null or amount <= 0 then raise exception 'Pago inválido'; end if;
 if exists (select 1 from private.binance_receipts r where r.transaction_id = tx) then raise exception 'Transacción ya usada'; end if;
 if payload->>'kind' = 'trip' then
  select * into t from public.trips where id = (payload->>'trip_id')::uuid and passenger_id = uid for update;
  if t.id is null or t.payment_method <> 'binance' then raise exception 'Viaje no encontrado'; end if;
  if t.payment_status = 'verified' then raise exception 'Este pago ya fue verificado'; end if;
  if t.status not in ('assigned', 'arrived', 'ongoing', 'finished') then raise exception 'Espera a que un conductor acepte el viaje'; end if;
  if at < t.created_at - interval '10 minutes' then raise exception 'Transacción anterior al viaje'; end if;
  if round(amount * 100) < t.fare_cents then raise exception 'Monto insuficiente'; end if;
  insert into private.binance_receipts(transaction_id, user_id, trip_id, amount, currency, transaction_time) values(tx, uid, t.id, amount, currency, at);
  update public.trips set binance_tx = tx, payment_status = 'verified', payment_verified_at = now(), payment_verified_by = 'auto',
   payment_note = 'Binance Pay · ' || amount::text || ' USDT', payment_reported_at = now() where id = t.id;
  return jsonb_build_object('status', 'verified');
 elsif payload->>'kind' = 'topup' then
  if not s.wallet_topup_enabled then raise exception 'Recargas no disponibles'; end if;
  if at < now() - interval '48 hours' then raise exception 'Transacción muy antigua'; end if;
  cents := floor(amount * 100);
  if cents < 100 or cents > 100000 then raise exception 'Monto inválido'; end if;
  insert into private.binance_receipts(transaction_id, user_id, amount, currency, transaction_time) values(tx, uid, amount, currency, at);
  insert into private.wallet_ledger(user_id, amount_cents, kind, note) values(uid, cents, 'topup', 'Recarga por Binance Pay · ' || tx);
  return jsonb_build_object('status', 'credited', 'amount_cents', cents, 'balance_cents', private.wallet_balance(uid));
 end if;
 raise exception 'Acción inválida';
end $$;
revoke all on function private.binance_confirm(text, jsonb) from public, anon, authenticated;
create function public.binance_confirm(worker_key text, payload jsonb) returns jsonb language sql security definer set search_path = '' as $$ select private.binance_confirm(worker_key, payload) $$;
revoke all on function public.binance_confirm(text, jsonb) from public;
grant execute on function public.binance_confirm(text, jsonb) to anon, authenticated;

-- Administración: métodos de pago.
create function private.admin_payment_methods(pago_movil_enabled boolean, binance_enabled boolean, binance_pay_id text) returns void language plpgsql security definer set search_path = '' as $$
declare pay_id text := nullif(regexp_replace(coalesce(binance_pay_id, ''), '[^0-9]', '', 'g'), '');
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 if binance_enabled and pay_id is null then raise exception 'Falta el Pay ID'; end if;
 if pay_id is not null and pay_id !~ '^[0-9]{5,15}$' then raise exception 'Pay ID inválido'; end if;
 update public.service_settings s set pago_movil_enabled = coalesce(admin_payment_methods.pago_movil_enabled, true),
  binance_enabled = coalesce(admin_payment_methods.binance_enabled, false), binance_pay_id = pay_id where s.id = 1;
end $$;
revoke all on function private.admin_payment_methods(boolean, boolean, text) from public, anon;
grant execute on function private.admin_payment_methods(boolean, boolean, text) to authenticated;
create function public.admin_payment_methods(pago_movil_enabled boolean, binance_enabled boolean, binance_pay_id text) returns void language sql security invoker set search_path = '' as $$ select private.admin_payment_methods(pago_movil_enabled, binance_enabled, binance_pay_id) $$;
revoke all on function public.admin_payment_methods(boolean, boolean, text) from public, anon;
grant execute on function public.admin_payment_methods(boolean, boolean, text) to authenticated;
