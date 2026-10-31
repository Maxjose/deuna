-- Interruptor y horario de la verificación automática de pago móvil (hora de Venezuela).
-- Fuera de horario o desactivada: no se consulta Tesoro Pagos y los pagos quedan pendientes para revisión manual.
alter table private.payment_config
 add column enabled boolean not null default true,
 add column auto_start time not null default '00:00',
 add column auto_end time not null default '00:00';

-- Activa ahora: encendida y dentro del horario. Inicio igual a cierre = todo el día; admite horarios que cruzan la medianoche.
create function private.payment_auto_active(clock time default (now() at time zone 'America/Caracas')::time) returns boolean
language sql stable security definer set search_path = '' as $$
 select c.enabled and (
  c.auto_start = c.auto_end
  or (c.auto_start < c.auto_end and clock >= c.auto_start and clock < c.auto_end)
  or (c.auto_start > c.auto_end and (clock >= c.auto_start or clock < c.auto_end))
 ) from private.payment_config c where c.id = 1
$$;
revoke all on function private.payment_auto_active(time) from public, anon, authenticated;

-- Pasa a revisión manual los pagos que esperaban verificación automática cuando esta no está activa.
create function private.hold_payments(reason text) returns void language sql security definer set search_path = '' as $$
 update public.trips set payment_status = 'review', payment_note = reason, payment_locked_until = null, payment_lease = null
 where payment_status = 'checking' and coalesce(payment_locked_until, now()) <= now()
$$;
revoke all on function private.hold_payments(text) from public, anon, authenticated;

create or replace function private.wake_payments() returns void language plpgsql security definer set search_path = '' as $$
declare url text; key text; cfg private.payment_config;
begin
 select * into cfg from private.payment_config where id = 1;
 if not private.payment_auto_active() then
  perform private.hold_payments(case when cfg.enabled then 'Fuera del horario de verificación automática' else 'Verificación automática desactivada' end);
  return;
 end if;
 if not exists (select 1 from public.trips where payment_status = 'checking' and payment_next_check_at <= now()
                 and coalesce(payment_locked_until, now()) <= now()) then return; end if;
 select worker_key into key from private.push_config where id = 1;
 url := cfg.verify_url;
 if url is null or key is null then return; end if;
 perform net.http_post(url := url, body := '{}'::jsonb,
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-key', key), timeout_milliseconds := 90000);
exception when others then raise log 'Payment wake failed: %', SQLSTATE;
end $$;

-- El trabajador no reclama nada (ni se conecta al banco) si la verificación no está activa.
create or replace function private.payment_worker(worker_key text, action text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cfg private.payment_config; t public.trips; outcome text; note text; result jsonb;
begin
 if worker_key is null or length(worker_key) <> 64 or worker_key is distinct from (select c.worker_key from private.push_config c where id = 1) then
  raise exception 'No autorizado';
 end if;
 select * into strict cfg from private.payment_config where id = 1;
 if action = 'claim' then
  if not private.payment_auto_active() then return '[]'::jsonb; end if;
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
   update public.trips set payment_next_check_at = now() + interval '2 minutes', payment_locked_until = null, payment_lease = null,
    payment_note = note where id = t.id;
  else
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

-- Al informar un pago fuera de horario o con la verificación desactivada, queda directamente para revisión manual.
create or replace function private.report_payment(trip_id uuid, reference text, bank text default null, phone text default null, amount_bs numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 uid uuid := auth.uid(); t public.trips;
 clean text := regexp_replace(coalesce(reference, ''), '[^0-9]', '', 'g');
 clean_phone text := nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '');
 expected numeric; paid numeric; next_status text; next_note text; cfg private.payment_config;
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
 if expected is not null and abs(paid - expected) > greatest(1, expected * 0.01) then raise exception 'El monto no coincide con el del viaje'; end if;
 if exists (select 1 from public.trips o where o.id <> t.id and o.payment_status in ('checking', 'verified', 'review')
            and right(o.payment_reference, 6) = right(clean, 6) and o.payment_bank is not distinct from bank) then
  raise exception 'Esta referencia ya fue usada en otro viaje';
 end if;
 select * into cfg from private.payment_config where id = 1;
 if bank is null or clean_phone is null then next_status := 'review'; next_note := 'Faltan banco o teléfono de origen';
 elsif not private.payment_auto_active() then
  next_status := 'review';
  next_note := case when cfg.enabled then 'Fuera del horario de verificación automática' else 'Verificación automática desactivada' end;
 else next_status := 'checking'; next_note := null; end if;
 update public.trips set
  payment_reference = clean, payment_reported_at = now(), payment_bank = bank, payment_phone = clean_phone, payment_amount_bs = paid,
  payment_status = next_status, payment_note = next_note,
  payment_attempts = 0, payment_next_check_at = now(), payment_locked_until = null, payment_lease = null
 where id = t.id;
 if next_status = 'checking' then perform private.wake_payments(); end if;
 return jsonb_build_object('status', next_status);
end $$;

-- Reintento manual: solo si la verificación automática está activa.
create or replace function private.admin_payment(trip_id uuid, action text, note text default null) returns void
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
  if not private.payment_auto_active() then raise exception 'La verificación automática no está activa'; end if;
  update public.trips set payment_status = 'checking', payment_attempts = 0, payment_next_check_at = now(), payment_locked_until = null, payment_lease = null
  where id = admin_payment.trip_id and payment_method = 'pago_movil' and payment_reference is not null and payment_bank is not null and payment_phone is not null
   and payment_status <> 'verified';
  perform private.wake_payments();
 else raise exception 'Acción inválida'; end if;
 if not found and action <> 'retry' then raise exception 'Pago no encontrado'; end if;
end $$;

create or replace function private.payment_health() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cfg private.payment_config;
begin
 if uid is null or not exists (select 1 from public.profiles where id = uid and role = 'admin' and not suspended) then raise exception 'No autorizado'; end if;
 select * into strict cfg from private.payment_config where id = 1;
 return jsonb_build_object('last_run_at', cfg.last_run_at, 'last_ok', cfg.last_ok, 'last_message', cfg.last_message,
  'enabled', cfg.enabled, 'auto_start', to_char(cfg.auto_start, 'HH24:MI'), 'auto_end', to_char(cfg.auto_end, 'HH24:MI'),
  'active', private.payment_auto_active());
end $$;

-- Configuración (solo administración).
create function private.save_payment_automation(enabled boolean, auto_start time, auto_end time) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
 if uid is null or not exists (select 1 from public.profiles where id = uid and role = 'admin' and not suspended) then raise exception 'No autorizado'; end if;
 if enabled is null or auto_start is null or auto_end is null then raise exception 'Configuración inválida'; end if;
 update private.payment_config c set enabled = save_payment_automation.enabled, auto_start = save_payment_automation.auto_start,
  auto_end = save_payment_automation.auto_end where c.id = 1;
 perform private.wake_payments();
 return private.payment_health();
end $$;
revoke all on function private.save_payment_automation(boolean, time, time) from public, anon;
grant execute on function private.save_payment_automation(boolean, time, time) to authenticated;
create function public.save_payment_automation(enabled boolean, auto_start time, auto_end time) returns jsonb
language sql security invoker set search_path = '' as $$ select private.save_payment_automation(enabled, auto_start, auto_end) $$;
revoke all on function public.save_payment_automation(boolean, time, time) from public, anon;
grant execute on function public.save_payment_automation(boolean, time, time) to authenticated;
