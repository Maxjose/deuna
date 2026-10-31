-- Una sola sesión de verificación a la vez, con ventana de ~50 s, y reintentos escalonados.
-- El servidor obtiene un turno ("start"); mientras dura, solo ese turno reclama pagos y los pagos nuevos esperan a
-- que esa misma sesión los recoja. Reintentos de "no encontrado": cada 30 s los primeros 5, luego cada 2 min.
alter table private.payment_config
 add column run_id uuid,
 add column run_until timestamptz;

create or replace function private.wake_payments() returns void language plpgsql security definer set search_path = '' as $$
declare url text; key text; cfg private.payment_config;
begin
 select * into cfg from private.payment_config where id = 1;
 if not private.payment_auto_active() then
  perform private.hold_payments(case when cfg.enabled then 'Fuera del horario de verificación automática' else 'Verificación automática desactivada' end);
  return;
 end if;
 -- Hay una sesión abierta con tiempo suficiente: ella recoge los pagos nuevos.
 if cfg.run_until is not null and cfg.run_until > now() + interval '10 seconds' then return; end if;
 if not exists (select 1 from public.trips where payment_status = 'checking' and payment_next_check_at <= now()
                 and coalesce(payment_locked_until, now()) <= now()) then return; end if;
 select worker_key into key from private.push_config where id = 1;
 url := cfg.verify_url;
 if url is null or key is null then return; end if;
 perform net.http_post(url := url, body := '{}'::jsonb,
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-key', key), timeout_milliseconds := 90000);
exception when others then raise log 'Payment wake failed: %', SQLSTATE;
end $$;

create or replace function private.payment_worker(worker_key text, action text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cfg private.payment_config; t public.trips; outcome text; note text; result jsonb; run uuid := nullif(payload->>'run', '')::uuid;
begin
 if worker_key is null or length(worker_key) <> 64 or worker_key is distinct from (select c.worker_key from private.push_config c where id = 1) then
  raise exception 'No autorizado';
 end if;
 select * into strict cfg from private.payment_config where id = 1 for update;
 if action = 'start' then
  -- Turno exclusivo de ~75 s (la ventana del servidor es de 50 s; el resto es margen).
  if not private.payment_auto_active() or (cfg.run_until is not null and cfg.run_until > now()) then return jsonb_build_object('run', null); end if;
  update private.payment_config set run_id = gen_random_uuid(), run_until = now() + interval '75 seconds' where id = 1 returning run_id into run;
  return jsonb_build_object('run', run);
 elsif action = 'end' then
  update private.payment_config set run_id = null, run_until = null where id = 1 and run_id = run;
  return jsonb_build_object('saved', true);
 elsif action = 'next_due' then
  return jsonb_build_object('next_due', (select min(payment_next_check_at) from public.trips where payment_status = 'checking'));
 elsif action = 'claim' then
  if not private.payment_auto_active() then return '[]'::jsonb; end if;
  -- Con turno: debe ser el turno vigente. Sin turno (versión anterior del servidor): solo si no hay otra sesión.
  if run is not null then
   if cfg.run_id is distinct from run or cfg.run_until <= now() then return '[]'::jsonb; end if;
  elsif cfg.run_until is not null and cfg.run_until > now() then return '[]'::jsonb; end if;
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
   update public.trips set payment_attempts = payment_attempts + 1,
    payment_next_check_at = now() + case when t.payment_attempts + 1 <= 5 then interval '30 seconds' else interval '2 minutes' end,
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
