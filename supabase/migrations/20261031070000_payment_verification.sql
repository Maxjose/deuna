-- Verificación automática de pago móvil con Tesoro Pagos (Banco del Tesoro).
-- El pasajero informa referencia, banco y teléfono de origen y el monto transferido; un trabajador en el
-- servidor (/api/payments/verify) valida el pago en Tesoro Pagos. Si no se verifica en ~15 minutos, queda
-- pendiente para revisión manual del admin. El trabajador usa la misma clave de servidor que el envío push.

alter table public.trips
 add column payment_bank text check (payment_bank is null or payment_bank ~ '^[0-9]{4}$'),
 add column payment_phone text check (payment_phone is null or payment_phone ~ '^0[0-9]{10}$'),
 add column payment_amount_bs numeric(14,2) check (payment_amount_bs is null or payment_amount_bs > 0),
 add column payment_status text check (payment_status is null or payment_status in ('checking', 'verified', 'review', 'rejected')),
 add column payment_attempts integer not null default 0,
 add column payment_next_check_at timestamptz,
 add column payment_locked_until timestamptz,
 add column payment_lease uuid,
 add column payment_note text check (payment_note is null or length(payment_note) <= 300),
 add column payment_verified_at timestamptz,
 add column payment_verified_by text check (payment_verified_by is null or payment_verified_by in ('auto', 'admin'));
create index trips_payment_due on public.trips(payment_next_check_at) where payment_status = 'checking';
create index trips_payment_reference on public.trips(payment_reference, payment_bank) where payment_reference is not null;

create table private.payment_config (
 id integer primary key check (id = 1),
 verify_url text not null,
 max_attempts integer not null default 15 check (max_attempts between 1 and 120),
 last_run_at timestamptz,
 last_ok boolean,
 last_message text
);
insert into private.payment_config (id, verify_url) values (1, 'https://deuna-five.vercel.app/api/payments/verify');
alter table private.payment_config enable row level security;
revoke all on private.payment_config from public, anon, authenticated;

-- Monto esperado en Bs del viaje (tarifa en USD por la tasa fijada al solicitar).
create function private.trip_amount_bs(t public.trips) returns numeric language sql immutable set search_path = '' as $$
 select case when t.fare_cents is null or t.exchange_rate is null then null else round(t.fare_cents * t.exchange_rate / 100.0, 2) end
$$;
revoke all on function private.trip_amount_bs(public.trips) from public, anon, authenticated;

-- Despierta al trabajador si hay pagos por verificar (inmediato al informar y cada minuto por cron).
create function private.wake_payments() returns void language plpgsql security definer set search_path = '' as $$
declare url text; key text;
begin
 if not exists (select 1 from public.trips where payment_status = 'checking' and payment_next_check_at <= now()
                 and coalesce(payment_locked_until, now()) <= now()) then return; end if;
 select verify_url into url from private.payment_config where id = 1;
 select worker_key into key from private.push_config where id = 1;
 if url is null or key is null then return; end if;
 perform net.http_post(url := url, body := '{}'::jsonb,
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-key', key), timeout_milliseconds := 90000);
exception when others then raise log 'Payment wake failed: %', SQLSTATE;
end $$;
revoke all on function private.wake_payments() from public, anon, authenticated;

-- El pasajero informa (o corrige) los datos de su pago móvil.
drop function public.report_payment(uuid, text);
drop function private.report_payment(uuid, text);
create function private.report_payment(trip_id uuid, reference text, bank text default null, phone text default null, amount_bs numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 uid uuid := auth.uid(); t public.trips;
 clean text := regexp_replace(coalesce(reference, ''), '[^0-9]', '', 'g');
 clean_phone text := nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '');
 expected numeric; paid numeric;
begin
 if uid is null then raise exception 'No autorizado'; end if;
 select * into t from public.trips where id = report_payment.trip_id and passenger_id = uid for update;
 if t.id is null or t.payment_method <> 'pago_movil' then raise exception 'Este viaje no usa pago móvil'; end if;
 if t.status not in ('assigned', 'arrived', 'ongoing', 'finished') then raise exception 'Espera a que un conductor acepte el viaje'; end if;
 if t.payment_status = 'verified' then raise exception 'Este pago ya fue verificado'; end if;
 if clean !~ '^[0-9]{4,20}$' then raise exception 'Referencia inválida'; end if;
 if bank is not null and bank !~ '^[0-9]{4}$' then raise exception 'Banco inválido'; end if;
 if clean_phone is not null and clean_phone !~ '^0[0-9]{10}$' then raise exception 'Teléfono inválido'; end if;
 expected := private.trip_amount_bs(t);
 paid := coalesce(round(amount_bs, 2), expected);
 if paid is null or paid <= 0 then raise exception 'Monto inválido'; end if;
 -- Se aceptan pequeñas diferencias por redondeo: hasta Bs. 1 o el 1 %, lo que sea mayor.
 if expected is not null and abs(paid - expected) > greatest(1, expected * 0.01) then raise exception 'El monto no coincide con el del viaje'; end if;
 -- Una misma referencia no puede pagar dos viajes.
 if exists (select 1 from public.trips o where o.id <> t.id and o.payment_status in ('checking', 'verified', 'review')
            and right(o.payment_reference, 6) = right(clean, 6) and o.payment_bank is not distinct from bank) then
  raise exception 'Esta referencia ya fue usada en otro viaje';
 end if;
 update public.trips set
  payment_reference = clean, payment_reported_at = now(), payment_bank = bank, payment_phone = clean_phone, payment_amount_bs = paid,
  payment_status = case when bank is null or clean_phone is null then 'review' else 'checking' end,
  payment_note = case when bank is null or clean_phone is null then 'Faltan banco o teléfono de origen' else null end,
  payment_attempts = 0, payment_next_check_at = now(), payment_locked_until = null, payment_lease = null
 where id = t.id;
 perform private.wake_payments();
 return jsonb_build_object('status', case when bank is null or clean_phone is null then 'review' else 'checking' end);
end $$;
revoke all on function private.report_payment(uuid, text, text, text, numeric) from public, anon;
grant execute on function private.report_payment(uuid, text, text, text, numeric) to authenticated;
create function public.report_payment(trip_id uuid, reference text, bank text default null, phone text default null, amount_bs numeric default null)
returns jsonb language sql security invoker set search_path = '' as $$ select private.report_payment(trip_id, reference, bank, phone, amount_bs) $$;
revoke all on function public.report_payment(uuid, text, text, text, numeric) from public, anon;
grant execute on function public.report_payment(uuid, text, text, text, numeric) to authenticated;

-- Trabajador del servidor: reclama pagos por verificar y registra el resultado.
create function private.payment_worker(worker_key text, action text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cfg private.payment_config; t public.trips; outcome text; note text; result jsonb;
begin
 if worker_key is null or length(worker_key) <> 64 or worker_key is distinct from (select c.worker_key from private.push_config c where id = 1) then
  raise exception 'No autorizado';
 end if;
 select * into strict cfg from private.payment_config where id = 1;
 if action = 'claim' then
  with due as (
   select id from public.trips
   where payment_status = 'checking' and payment_next_check_at <= now() and coalesce(payment_locked_until, now()) <= now()
   order by payment_next_check_at limit 10 for update skip locked
  ), claimed as (
   update public.trips tr set payment_locked_until = now() + interval '3 minutes', payment_lease = gen_random_uuid()
   from due where tr.id = due.id
   returning tr.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
   'trip_id', c.id, 'lease', c.payment_lease, 'reference', right(c.payment_reference, 6), 'bank', c.payment_bank,
   'phone', c.payment_phone, 'amount', replace(to_char(c.payment_amount_bs, 'FM999999990.00'), '.', ','), 'attempts', c.payment_attempts)), '[]'::jsonb)
  into result from claimed c;
  return result;
 elsif action = 'finish' then
  select * into t from public.trips where id = (payload->>'trip_id')::uuid and payment_lease = (payload->>'lease')::uuid for update;
  if t.id is null then return jsonb_build_object('saved', false); end if;
  outcome := payload->>'outcome';
  note := left(nullif(btrim(payload->>'message'), ''), 300);
  if outcome = 'verified' then
   update public.trips set payment_status = 'verified', payment_verified_at = now(), payment_verified_by = 'auto', payment_note = note,
    payment_locked_until = null, payment_lease = null, payment_attempts = payment_attempts + 1 where id = t.id;
  elsif outcome = 'not_found' and t.payment_attempts + 1 < cfg.max_attempts then
   update public.trips set payment_attempts = payment_attempts + 1, payment_next_check_at = now() + interval '1 minute',
    payment_locked_until = null, payment_lease = null, payment_note = note where id = t.id;
  elsif outcome = 'error' then
   -- Fallo técnico (banco caído, sesión): reintenta sin consumir intentos.
   update public.trips set payment_next_check_at = now() + interval '2 minutes', payment_locked_until = null, payment_lease = null,
    payment_note = note where id = t.id;
  else
   -- No encontrado tras todos los intentos, ya confirmado antes en el banco o respuesta desconocida: revisión manual.
   update public.trips set payment_status = 'review', payment_attempts = payment_attempts + 1, payment_locked_until = null, payment_lease = null,
    payment_note = coalesce(note, 'Sin verificar') where id = t.id;
  end if;
  return jsonb_build_object('saved', true);
 elsif action = 'health' then
  update private.payment_config set last_run_at = now(), last_ok = (payload->>'ok')::boolean, last_message = left(payload->>'message', 300) where id = 1;
  return jsonb_build_object('saved', true);
 end if;
 raise exception 'Acción inválida';
end $$;
revoke all on function private.payment_worker(text, text, jsonb) from public;
grant execute on function private.payment_worker(text, text, jsonb) to anon, authenticated;
create function public.payment_worker(worker_key text, action text, payload jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$ select private.payment_worker(worker_key, action, payload) $$;
revoke all on function public.payment_worker(text, text, jsonb) from public;
grant execute on function public.payment_worker(text, text, jsonb) to anon, authenticated;

-- Administración: aprobar, rechazar o reintentar un pago, y ver el estado de la conexión.
create function private.admin_payment(trip_id uuid, action text, note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
 if uid is null or not exists (select 1 from public.profiles where id = uid and role = 'admin' and not suspended) then raise exception 'No autorizado'; end if;
 if action = 'approve' then
  update public.trips set payment_status = 'verified', payment_verified_at = now(), payment_verified_by = 'admin',
   payment_note = coalesce(left(nullif(btrim(note), ''), 300), 'Aprobado manualmente'), payment_locked_until = null, payment_lease = null
  where id = admin_payment.trip_id and payment_method = 'pago_movil' and payment_reference is not null;
 elsif action = 'reject' then
  update public.trips set payment_status = 'rejected', payment_note = coalesce(left(nullif(btrim(note), ''), 300), 'Rechazado por la administración'),
   payment_locked_until = null, payment_lease = null
  where id = admin_payment.trip_id and payment_method = 'pago_movil' and payment_reference is not null;
 elsif action = 'retry' then
  update public.trips set payment_status = 'checking', payment_attempts = 0, payment_next_check_at = now(), payment_locked_until = null, payment_lease = null
  where id = admin_payment.trip_id and payment_method = 'pago_movil' and payment_reference is not null and payment_bank is not null and payment_phone is not null
   and payment_status <> 'verified';
  perform private.wake_payments();
 else raise exception 'Acción inválida'; end if;
 if not found and action <> 'retry' then raise exception 'Pago no encontrado'; end if;
end $$;
revoke all on function private.admin_payment(uuid, text, text) from public, anon;
grant execute on function private.admin_payment(uuid, text, text) to authenticated;
create function public.admin_payment(trip_id uuid, action text, note text default null) returns void
language sql security invoker set search_path = '' as $$ select private.admin_payment(trip_id, action, note) $$;
revoke all on function public.admin_payment(uuid, text, text) from public, anon;
grant execute on function public.admin_payment(uuid, text, text) to authenticated;

create function private.payment_health() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cfg private.payment_config;
begin
 if uid is null or not exists (select 1 from public.profiles where id = uid and role = 'admin' and not suspended) then raise exception 'No autorizado'; end if;
 select * into strict cfg from private.payment_config where id = 1;
 return jsonb_build_object('last_run_at', cfg.last_run_at, 'last_ok', cfg.last_ok, 'last_message', cfg.last_message);
end $$;
revoke all on function private.payment_health() from public, anon;
grant execute on function private.payment_health() to authenticated;
create function public.payment_health() returns jsonb language sql security invoker set search_path = '' as $$ select private.payment_health() $$;
revoke all on function public.payment_health() from public, anon;
grant execute on function public.payment_health() to authenticated;

select cron.schedule('de1na-payment-verify', '* * * * *', 'select private.wake_payments()');
