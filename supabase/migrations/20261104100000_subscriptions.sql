-- Modelo de cobro por suscripción (alternativo a la comisión) + datos de la moto y control de abuso de la prueba gratis.
-- Modo «subscription»: los pasajeros pagan al conductor (efectivo o pago móvil directo); los conductores pagan un plan
-- prepagado (semanal o mensual) con 7 días gratis una sola vez y 24 h de gracia. Cada viaje guarda su modelo.

-- ── Configuración ───────────────────────────────────────────────────────────────────────────────────────────────
alter table public.service_settings
 add column billing_mode text not null default 'commission' check (billing_mode in ('commission', 'subscription')),
 add column sub_week_cents integer not null default 600 check (sub_week_cents between 100 and 100000),
 add column sub_month_cents integer not null default 2000 check (sub_month_cents between 100 and 100000),
 add column sub_trial_enabled boolean not null default true,
 add column sub_trial_days integer not null default 7 check (sub_trial_days between 1 and 60),
 add column sub_grace_hours integer not null default 24 check (sub_grace_hours between 0 and 168),
 add column sub_auto_activation boolean not null default true,
 add column sub_whatsapp text not null default '04126655273' check (sub_whatsapp ~ '^0[0-9]{10}$');

-- ── Datos de la moto y de cobro del conductor (únicos: placa y cédula) ──────────────────────────────────────────
create table private.driver_vehicles(
 driver_id uuid primary key references auth.users(id) on delete cascade,
 plate text not null unique check (plate ~ '^[A-Z0-9]{5,8}$'),
 model text not null check (length(model) between 2 and 60),
 color text not null check (length(color) between 3 and 30),
 updated_at timestamptz not null default now()
);
create table private.driver_payout(
 driver_id uuid primary key references auth.users(id) on delete cascade,
 bank text not null check (bank ~ '^[0-9]{4}$'),
 id_number text not null unique check (id_number ~ '^[0-9]{5,9}$'),
 phone text not null check (phone ~ '^0[0-9]{10}$'),
 updated_at timestamptz not null default now()
);
insert into private.driver_payout(driver_id, bank, id_number, phone)
select u.id, u.raw_user_meta_data->'payout'->>'bank', u.raw_user_meta_data->'payout'->>'id_number', u.raw_user_meta_data->'payout'->>'phone'
from auth.users u
where (u.raw_user_meta_data->'payout'->>'bank') ~ '^[0-9]{4}$' and (u.raw_user_meta_data->'payout'->>'id_number') ~ '^[0-9]{5,9}$'
 and (u.raw_user_meta_data->'payout'->>'phone') ~ '^0[0-9]{10}$'
on conflict do nothing;

create function private.my_driver_data() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'No autorizado'; end if;
 return jsonb_build_object(
  'vehicle', (select jsonb_build_object('plate', plate, 'model', model, 'color', color) from private.driver_vehicles where driver_id = auth.uid()),
  'payout', (select jsonb_build_object('bank', bank, 'id_number', id_number, 'phone', phone) from private.driver_payout where driver_id = auth.uid()));
end $$;

create function private.save_my_vehicle(plate text, model text, color text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); p text := upper(regexp_replace(coalesce(plate, ''), '[^A-Za-z0-9]', '', 'g'));
begin
 if uid is null or (select role from public.profiles where id = uid) <> 'driver' then raise exception 'No autorizado'; end if;
 if p !~ '^[A-Z0-9]{5,8}$' then raise exception 'Placa inválida'; end if;
 if length(btrim(coalesce(model, ''))) < 2 or length(btrim(coalesce(color, ''))) < 3 then raise exception 'Completa modelo y color'; end if;
 if exists (select 1 from private.driver_vehicles v where v.plate = p and v.driver_id <> uid) then raise exception 'Placa ya registrada'; end if;
 insert into private.driver_vehicles(driver_id, plate, model, color) values(uid, p, left(btrim(model), 60), left(btrim(color), 30))
 on conflict (driver_id) do update set plate = excluded.plate, model = excluded.model, color = excluded.color, updated_at = now();
 return private.my_driver_data();
end $$;

create function private.save_my_payout(bank text, id_number text, phone text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); idn text := regexp_replace(coalesce(id_number, ''), '[^0-9]', '', 'g'); ph text := regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g');
begin
 if uid is null or (select role from public.profiles where id = uid) <> 'driver' then raise exception 'No autorizado'; end if;
 if bank !~ '^[0-9]{4}$' then raise exception 'Banco inválido'; end if;
 if idn !~ '^[0-9]{5,9}$' then raise exception 'Cédula inválida'; end if;
 if ph !~ '^0[0-9]{10}$' then raise exception 'Teléfono inválido'; end if;
 if exists (select 1 from private.driver_payout d where d.id_number = idn and d.driver_id <> uid) then raise exception 'Cédula ya registrada'; end if;
 insert into private.driver_payout(driver_id, bank, id_number, phone) values(uid, bank, idn, ph)
 on conflict (driver_id) do update set bank = excluded.bank, id_number = excluded.id_number, phone = excluded.phone, updated_at = now();
 return private.my_driver_data();
end $$;

-- Para aprobar a un conductor deben estar registrados su moto y su pago móvil (cédula).
create function private.require_driver_data() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if old.role = 'driver' and new.role = 'driver' and not old.approved and new.approved
    and (not exists (select 1 from private.driver_vehicles where driver_id = new.id) or not exists (select 1 from private.driver_payout where driver_id = new.id)) then
  raise exception 'Faltan datos del conductor';
 end if;
 return new;
end $$;
create trigger require_driver_data before update of approved on public.profiles for each row execute function private.require_driver_data();

-- ── Suscripciones ───────────────────────────────────────────────────────────────────────────────────────────────
create table private.driver_subscriptions(
 driver_id uuid primary key references auth.users(id) on delete cascade,
 paid_until timestamptz,
 trial_used_at timestamptz,
 reminded_2d_for timestamptz,
 reminded_0d_for timestamptz,
 updated_at timestamptz not null default now()
);
create table private.trial_claims(
 kind text not null check (kind in ('cedula', 'plate', 'device')),
 value text not null,
 driver_id uuid not null,
 created_at timestamptz not null default now(),
 primary key (kind, value)
);
create table private.subscription_payments(
 id uuid primary key default gen_random_uuid(),
 driver_id uuid not null references auth.users(id) on delete cascade,
 plan text not null check (plan in ('week', 'month', 'trial', 'gift')),
 days integer not null check (days between 1 and 366),
 amount_cents integer not null default 0,
 method text not null check (method in ('pago_movil', 'binance', 'admin', 'trial')),
 status text not null default 'approved' check (status in ('checking', 'review', 'approved', 'rejected')),
 reference text, bank text, phone text, amount_bs numeric(14,2), binance_tx text,
 note text check (length(note) <= 300),
 attempts integer not null default 0, next_check_at timestamptz, locked_until timestamptz, lease uuid,
 created_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid
);
create index subscription_payments_driver on private.subscription_payments(driver_id, created_at desc);
create index subscription_payments_checking on private.subscription_payments(next_check_at) where status = 'checking';

alter table public.trips add column billing_mode text not null default 'commission' check (billing_mode in ('commission', 'subscription'));
create function private.trip_billing_mode() returns trigger language plpgsql security definer set search_path = '' as $$
begin new.billing_mode := coalesce((select billing_mode from public.service_settings where id = 1), 'commission'); return new; end $$;
create trigger trip_billing_mode before insert on public.trips for each row execute function private.trip_billing_mode();

-- Suma días al plan (desde hoy si ya venció).
create function private.extend_plan(driver uuid, add_days integer) returns timestamptz language plpgsql security definer set search_path = '' as $$
declare until timestamptz;
begin
 insert into private.driver_subscriptions(driver_id) values(driver) on conflict do nothing;
 update private.driver_subscriptions set paid_until = greatest(now(), coalesce(paid_until, now())) + make_interval(days => add_days), updated_at = now()
 where driver_id = driver returning paid_until into until;
 return until;
end $$;

-- Bloqueado: modo suscripción y vencido más allá de la gracia.
create function private.plan_blocked(driver uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce((select s.billing_mode = 'subscription' from public.service_settings s where s.id = 1), false)
  and coalesce((select now() > coalesce(d.paid_until, '-infinity'::timestamptz) + make_interval(hours => s.sub_grace_hours)
                from public.service_settings s left join private.driver_subscriptions d on d.driver_id = driver where s.id = 1), true)
$$;

-- Prueba gratis: una vez por conductor, cédula, placa y teléfono (dispositivo). Requiere estar aprobado.
create function private.claim_trial(driver uuid, device text) returns boolean language plpgsql security definer set search_path = '' as $$
declare s public.service_settings; ced text; plate text; dev text := nullif(left(btrim(coalesce(device, '')), 128), '');
begin
 select * into strict s from public.service_settings where id = 1;
 if s.billing_mode <> 'subscription' or not s.sub_trial_enabled then return false; end if;
 if not exists (select 1 from public.profiles where id = driver and role = 'driver' and approved and not suspended) then return false; end if;
 if exists (select 1 from private.driver_subscriptions where driver_id = driver and (trial_used_at is not null or paid_until is not null)) then return false; end if;
 select id_number into ced from private.driver_payout where driver_id = driver;
 select v.plate into plate from private.driver_vehicles v where v.driver_id = driver;
 if ced is null or plate is null then return false; end if;
 if exists (select 1 from private.trial_claims c where (c.kind = 'cedula' and c.value = ced) or (c.kind = 'plate' and c.value = plate) or (dev is not null and c.kind = 'device' and c.value = dev)) then
  insert into private.driver_subscriptions(driver_id, trial_used_at) values(driver, now()) on conflict (driver_id) do update set trial_used_at = coalesce(private.driver_subscriptions.trial_used_at, now());
  return false;
 end if;
 insert into private.trial_claims(kind, value, driver_id) values('cedula', ced, driver), ('plate', plate, driver);
 if dev is not null then insert into private.trial_claims(kind, value, driver_id) values('device', dev, driver); end if;
 insert into private.driver_subscriptions(driver_id, trial_used_at) values(driver, now()) on conflict (driver_id) do update set trial_used_at = now();
 perform private.extend_plan(driver, s.sub_trial_days);
 insert into private.subscription_payments(driver_id, plan, days, method, status, note) values(driver, 'trial', s.sub_trial_days, 'trial', 'approved', 'Prueba gratis');
 return true;
end $$;

create function private.plan_state(driver uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.service_settings; d private.driver_subscriptions; plan_status text; grace timestamptz;
begin
 select * into strict s from public.service_settings where id = 1;
 select * into d from private.driver_subscriptions where driver_id = driver;
 grace := d.paid_until + make_interval(hours => s.sub_grace_hours);
 plan_status := case when s.billing_mode <> 'subscription' then 'not_applicable'
  when d.paid_until is null then 'none'
  when now() <= d.paid_until and d.paid_until - now() <= interval '2 days' then 'expiring'
  when now() <= d.paid_until then 'active'
  when now() <= grace then 'grace' else 'expired' end;
 return jsonb_build_object('mode', s.billing_mode, 'status', plan_status, 'paid_until', d.paid_until, 'grace_until', grace,
  'trial_used', d.trial_used_at is not null, 'trial_enabled', s.sub_trial_enabled, 'trial_days', s.sub_trial_days,
  'week_cents', s.sub_week_cents, 'month_cents', s.sub_month_cents, 'auto', s.sub_auto_activation, 'whatsapp', s.sub_whatsapp,
  'exchange_rate', s.exchange_rate, 'pago_movil', jsonb_build_object('bank', s.pago_movil_bank, 'phone', s.pago_movil_phone, 'id', s.pago_movil_id),
  'binance', case when s.binance_enabled then jsonb_build_object('pay_id', s.binance_pay_id, 'link', s.binance_pay_link) end,
  'payments', coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select sp.id, sp.plan, sp.days, sp.amount_cents, sp.method, sp.status, sp.reference, sp.binance_tx, sp.note, sp.created_at from private.subscription_payments sp
    where sp.driver_id = driver order by sp.created_at desc limit 20) x), '[]'::jsonb));
end $$;

create function private.my_plan(device text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or (select role from public.profiles where id = auth.uid()) <> 'driver' then raise exception 'No autorizado'; end if;
 perform private.claim_trial(auth.uid(), device);
 return private.plan_state(auth.uid());
end $$;

-- Pago de plan por pago móvil (activación automática): queda verificando con Tesoro Pagos.
create function private.request_plan_payment(plan text, reference text, bank text, phone text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.service_settings; cents integer; days integer; clean text := right(regexp_replace(coalesce(reference, ''), '[^0-9]', '', 'g'), 6);
 ph text := regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'); st text; pid uuid;
begin
 if uid is null or (select role from public.profiles where id = uid) <> 'driver' then raise exception 'No autorizado'; end if;
 select * into strict s from public.service_settings where id = 1;
 if s.billing_mode <> 'subscription' then raise exception 'Suscripción no activa'; end if;
 if not s.sub_auto_activation then raise exception 'Activación manual'; end if;
 if s.pago_movil_bank is null or s.exchange_rate is null then raise exception 'Pago movil no disponible'; end if;
 if plan not in ('week', 'month') then raise exception 'Plan inválido'; end if;
 cents := case when plan = 'week' then s.sub_week_cents else s.sub_month_cents end;
 days := case when plan = 'week' then 7 else 30 end;
 if clean !~ '^[0-9]{4,6}$' then raise exception 'Referencia inválida'; end if;
 if bank !~ '^[0-9]{4}$' then raise exception 'Banco inválido'; end if;
 if ph !~ '^0[0-9]{10}$' then raise exception 'Teléfono inválido'; end if;
 if exists (select 1 from private.subscription_payments p where p.reference = clean and p.bank = request_plan_payment.bank and p.status <> 'rejected')
    or exists (select 1 from public.trips t where right(t.payment_reference, 6) = clean and t.payment_bank = request_plan_payment.bank)
    or exists (select 1 from private.wallet_topups w where w.reference = clean and w.bank = request_plan_payment.bank and w.status <> 'rejected') then
  raise exception 'Esta referencia ya fue usada';
 end if;
 if exists (select 1 from private.subscription_payments p where p.driver_id = uid and p.status in ('checking', 'review')) then raise exception 'Tienes un pago en revisión'; end if;
 st := case when private.payment_auto_active() then 'checking' else 'review' end;
 insert into private.subscription_payments(driver_id, plan, days, amount_cents, method, status, reference, bank, phone, amount_bs, next_check_at, note)
 values(uid, plan, days, cents, 'pago_movil', st, clean, bank, ph, round(cents * s.exchange_rate / 100.0, 2), now(),
        case when st = 'review' then 'Pendiente de revisión manual' end)
 returning id into pid;
 if st = 'checking' then perform private.wake_payments(); end if;
 return jsonb_build_object('status', st, 'id', pid);
end $$;

-- ── Verificador de pagos (Tesoro): también procesa pagos de planes ──────────────────────────────────────────────
create or replace function private.wake_payments() returns void language plpgsql security definer set search_path = '' as $$
declare url text; key text; cfg private.payment_config;
begin
 select * into cfg from private.payment_config where id = 1;
 if not private.payment_auto_active() then
  perform private.hold_payments(case when cfg.enabled then 'Fuera del horario de verificación automática' else 'Verificación automática desactivada' end);
  update private.subscription_payments set status = 'review', note = 'Pendiente de revisión manual', locked_until = null, lease = null
   where status = 'checking' and coalesce(locked_until, now()) <= now();
  return;
 end if;
 if cfg.run_until is not null and cfg.run_until > now() + interval '10 seconds' then return; end if;
 if not exists (select 1 from public.trips where payment_status = 'checking' and payment_next_check_at <= now() and coalesce(payment_locked_until, now()) <= now())
    and not exists (select 1 from private.subscription_payments where status = 'checking' and next_check_at <= now() and coalesce(locked_until, now()) <= now()) then return; end if;
 select worker_key into key from private.push_config where id = 1;
 url := cfg.verify_url;
 if url is null or key is null then return; end if;
 perform net.http_post(url := url, body := '{}'::jsonb,
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-key', key), timeout_milliseconds := 90000);
exception when others then raise log 'Payment wake failed: %', SQLSTATE;
end $$;

create or replace function private.payment_worker(worker_key text, action text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cfg private.payment_config; t public.trips; sp private.subscription_payments; outcome text; msg text; result jsonb; subs jsonb;
 run uuid := nullif(payload->>'run', '')::uuid;
begin
 if worker_key is null or length(worker_key) <> 64 or worker_key is distinct from (select c.worker_key from private.push_config c where id = 1) then
  raise exception 'No autorizado';
 end if;
 select * into strict cfg from private.payment_config where id = 1 for update;
 if action = 'start' then
  if not private.payment_auto_active() or (cfg.run_until is not null and cfg.run_until > now()) then return jsonb_build_object('run', null); end if;
  update private.payment_config set run_id = gen_random_uuid(), run_until = now() + interval '75 seconds' where id = 1 returning run_id into run;
  return jsonb_build_object('run', run);
 elsif action = 'end' then
  update private.payment_config set run_id = null, run_until = null where id = 1 and run_id = run;
  return jsonb_build_object('saved', true);
 elsif action = 'next_due' then
  return jsonb_build_object('next_due', least(
   (select min(payment_next_check_at) from public.trips where payment_status = 'checking'),
   (select min(next_check_at) from private.subscription_payments where status = 'checking')));
 elsif action = 'claim' then
  if not private.payment_auto_active() then return '[]'::jsonb; end if;
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
  -- Pagos de planes: mismo formato (el id del pago va como trip_id; no se cruza con ids de viajes).
  with due as (
   select id from private.subscription_payments
   where status = 'checking' and next_check_at <= now() and coalesce(locked_until, now()) <= now()
   order by next_check_at limit 10 for update skip locked
  ), claimed as (
   update private.subscription_payments p set locked_until = now() + interval '3 minutes', lease = gen_random_uuid()
   from due where p.id = due.id returning p.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
   'trip_id', c.id, 'lease', c.lease, 'reference', c.reference, 'bank', c.bank, 'phone', c.phone,
   'amount', replace(to_char(c.amount_bs, 'FM999999990.00'), '.', ','), 'attempts', c.attempts)), '[]'::jsonb)
  into subs from claimed c;
  return result || subs;
 elsif action = 'finish' then
  outcome := payload->>'outcome';
  msg := left(nullif(btrim(payload->>'message'), ''), 300);
  select * into t from public.trips where id = (payload->>'trip_id')::uuid and payment_lease = (payload->>'lease')::uuid for update;
  if t.id is null then
   select * into sp from private.subscription_payments where id = (payload->>'trip_id')::uuid and lease = (payload->>'lease')::uuid for update;
   if sp.id is null then return jsonb_build_object('saved', false); end if;
   if outcome = 'verified' then
    update private.subscription_payments set status = 'approved', reviewed_at = now(), note = msg, locked_until = null, lease = null, attempts = attempts + 1 where id = sp.id;
    perform private.extend_plan(sp.driver_id, sp.days);
   elsif outcome = 'not_found' and sp.attempts + 1 < cfg.max_attempts then
    update private.subscription_payments set attempts = attempts + 1,
     next_check_at = now() + case when sp.attempts + 1 <= 5 then interval '30 seconds' else interval '2 minutes' end,
     locked_until = null, lease = null, note = msg where id = sp.id;
   elsif outcome = 'error' then
    update private.subscription_payments set next_check_at = now() + interval '2 minutes', locked_until = null, lease = null, note = msg where id = sp.id;
   else
    update private.subscription_payments set status = 'review', attempts = attempts + 1, locked_until = null, lease = null, note = coalesce(msg, 'Sin verificar') where id = sp.id;
   end if;
   return jsonb_build_object('saved', true);
  end if;
  if outcome = 'verified' then
   update public.trips set payment_status = 'verified', payment_verified_at = now(), payment_verified_by = 'auto', payment_note = msg,
    payment_locked_until = null, payment_lease = null, payment_attempts = payment_attempts + 1 where id = t.id;
  elsif outcome = 'not_found' and t.payment_attempts + 1 < cfg.max_attempts then
   update public.trips set payment_attempts = payment_attempts + 1,
    payment_next_check_at = now() + case when t.payment_attempts + 1 <= 5 then interval '30 seconds' else interval '2 minutes' end,
    payment_locked_until = null, payment_lease = null, payment_note = msg where id = t.id;
  elsif outcome = 'error' then
   update public.trips set payment_next_check_at = now() + interval '2 minutes', payment_locked_until = null, payment_lease = null,
    payment_note = msg where id = t.id;
  else
   update public.trips set payment_status = 'review', payment_attempts = payment_attempts + 1, payment_locked_until = null, payment_lease = null,
    payment_note = coalesce(msg, 'Sin verificar') where id = t.id;
  end if;
  return jsonb_build_object('saved', true);
 elsif action = 'health' then
  update private.payment_config set last_run_at = now(), last_ok = (payload->>'ok')::boolean, last_message = left(payload->>'message', 300) where id = 1;
  return jsonb_build_object('saved', true);
 end if;
 raise exception 'Acción inválida';
end $$;

-- Binance Pay también confirma pagos de planes (kind 'subscription' con plan).
do $$declare definition text; patched text;begin
 select pg_get_functiondef('private.binance_confirm(text,jsonb)'::regprocedure) into definition;
 patched := replace(definition, ' elsif payload->>''kind'' = ''topup'' then',
  ' elsif payload->>''kind'' = ''subscription'' then' || chr(10) ||
  '  if s.billing_mode <> ''subscription'' then raise exception ''Suscripción no activa''; end if;' || chr(10) ||
  '  if not s.sub_auto_activation then raise exception ''Activación manual''; end if;' || chr(10) ||
  '  if payload->>''plan'' not in (''week'', ''month'') then raise exception ''Plan inválido''; end if;' || chr(10) ||
  '  if not exists (select 1 from public.profiles where id = uid and role = ''driver'') then raise exception ''No autorizado''; end if;' || chr(10) ||
  '  if at < now() - interval ''48 hours'' then raise exception ''Transacción muy antigua''; end if;' || chr(10) ||
  '  cents := case when payload->>''plan'' = ''week'' then s.sub_week_cents else s.sub_month_cents end;' || chr(10) ||
  '  if round(amount * 100) < cents then raise exception ''Monto insuficiente''; end if;' || chr(10) ||
  '  insert into private.binance_receipts(transaction_id, user_id, amount, currency, transaction_time) values(tx, uid, amount, currency, at);' || chr(10) ||
  '  insert into private.subscription_payments(driver_id, plan, days, amount_cents, method, status, binance_tx, note, reviewed_at)' || chr(10) ||
  '   values(uid, payload->>''plan'', case when payload->>''plan'' = ''week'' then 7 else 30 end, cents, ''binance'', ''approved'', tx, ''Binance Pay · '' || amount::text || '' USDT'', now());' || chr(10) ||
  '  return jsonb_build_object(''status'', ''verified'', ''paid_until'', private.extend_plan(uid, case when payload->>''plan'' = ''week'' then 7 else 30 end));' || chr(10) ||
  ' elsif payload->>''kind'' = ''topup'' then');
 if patched = definition then raise exception 'Missing binance topup branch'; end if;
 execute patched;
end $$;

-- ── Reglas del viaje según su modelo ────────────────────────────────────────────────────────────────────────────
-- Solicitar: en suscripción solo efectivo y pago móvil (directo al conductor; no exige datos de pago móvil de De1na).
do $$declare definition text; patched text;begin
 select pg_get_functiondef('private.insert_quoted_trip(jsonb)'::regprocedure) into definition;
 patched := replace(definition, '(s.pago_movil_bank is null or s.pago_movil_phone is null or s.pago_movil_id is null or s.exchange_rate is null)',
  '((s.billing_mode = ''commission'' and (s.pago_movil_bank is null or s.pago_movil_phone is null or s.pago_movil_id is null)) or s.exchange_rate is null)');
 if patched = definition then raise exception 'Missing pago movil check'; end if;
 patched := replace(patched, '  if method not in (''cash'', ''pago_movil'', ''wallet'', ''binance'')',
  '  if s.billing_mode = ''subscription'' and method not in (''cash'', ''pago_movil'') then raise exception ''Metodo no disponible''; end if;' || chr(10) ||
  '  if method not in (''cash'', ''pago_movil'', ''wallet'', ''binance'')');
 if position('Metodo no disponible' in patched) = 0 then raise exception 'Missing method check'; end if;
 execute patched;
end $$;

-- Conductor: plan vencido no puede conectarse ni aceptar; pago móvil en suscripción no exige referencia.
do $$declare definition text; patched text;begin
 select pg_get_functiondef('private.operate(text,jsonb)'::regprocedure) into definition;
 patched := replace(definition,
  ' if action in (''accept'',''available'') and exists(select 1 from public.trips where driver_id=uid and status in (''assigned'',''arrived'',''ongoing'')) then raise exception ''Completa tu viaje activo primero'';end if;',
  ' if (action=''accept'' or (action=''available'' and coalesce((payload->>''available'')::boolean,false))) and private.plan_blocked(uid) and p.role=''driver'' then raise exception ''Plan vencido'';end if;' || chr(10) ||
  ' if action in (''accept'',''available'') and exists(select 1 from public.trips where driver_id=uid and status in (''assigned'',''arrived'',''ongoing'')) then raise exception ''Completa tu viaje activo primero'';end if;');
 if patched = definition then raise exception 'Missing operate plan check'; end if;
 patched := replace(patched, 'if t.status=''arrived'' and t.payment_method=''pago_movil'' and t.payment_reference is null then',
  'if t.status=''arrived'' and t.payment_method=''pago_movil'' and t.billing_mode=''commission'' and t.payment_reference is null then');
 if position('t.billing_mode=''commission'' and t.payment_reference' in patched) = 0 then raise exception 'Missing advance check'; end if;
 execute patched;
end $$;

create or replace function private.can_receive() returns boolean language sql stable security definer set search_path='' as $$
select coalesce((select role='driver' and approved and available and not suspended from public.profiles where id=auth.uid()),false) and not private.plan_blocked(auth.uid())$$;

create or replace function private.debt_trips(passenger uuid) returns setof public.trips language sql stable security definer set search_path = '' as $$
 select * from public.trips t
 where t.passenger_id = passenger and t.status = 'finished' and t.payment_method in ('pago_movil', 'binance') and t.billing_mode = 'commission'
  and t.payment_status is distinct from 'verified'
  and (t.payment_status = 'rejected' or t.created_at < now() - interval '60 minutes')
$$;

create or replace function private.credit_driver_trip() returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.service_settings; fee integer := 0; applies boolean;
begin
 if new.status <> 'finished' or new.driver_id is null or coalesce(new.fare_cents, 0) <= 0 or new.billing_mode = 'subscription' then return new; end if;
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

-- Persona del viaje: el pasajero ve la moto del conductor; en suscripción con pago móvil, sus datos para pagarle.
create or replace function private.trip_person(trip_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.trips;uid uuid:=auth.uid();peer uuid;person_name text;person_phone text;active boolean;begin
 if uid is null then raise exception 'No autorizado';end if;
 select * into strict t from public.trips where id=trip_id;
 if not coalesce((t.passenger_id=uid or t.driver_id=uid or (t.status='searching' and private.can_receive())),false) then raise exception 'No autorizado';end if;
 peer:=case when t.passenger_id=uid then t.driver_id else t.passenger_id end;
 if peer is null then return null;end if;
 active:=t.status in ('assigned','arrived','ongoing') and (t.passenger_id=uid or t.driver_id=uid);
 select coalesce(nullif(btrim(left(raw_user_meta_data->>'display_name',80)),''),nullif(btrim(left(raw_user_meta_data->>'full_name',80)),''),case when t.passenger_id=uid then 'Tu conductor' else 'Tu pasajero' end),
  nullif(regexp_replace(coalesce(raw_user_meta_data->>'contact_phone',''),'[^0-9+]','','g'),'')
 into person_name,person_phone from auth.users where id=peer;
 return jsonb_build_object('name',person_name,'rating',private.user_reputation(peer),
  'phone',case when active then left(person_phone,20) end,
  'vehicle',case when t.passenger_id=uid and active then (select jsonb_build_object('plate',plate,'model',model,'color',color) from private.driver_vehicles where driver_id=peer) end,
  'payout',case when t.passenger_id=uid and t.billing_mode='subscription' and t.payment_method='pago_movil' and t.status in ('assigned','arrived','ongoing','finished')
   then (select jsonb_build_object('bank',bank,'id_number',id_number,'phone',phone) from private.driver_payout where driver_id=peer) end);
end $$;

create or replace function private.admin_driver_earnings(driver_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 return private.earnings_of(driver_id) || jsonb_build_object('payout_account',
  (select jsonb_build_object('bank', bank, 'id_number', id_number, 'phone', phone) from private.driver_payout p where p.driver_id = admin_driver_earnings.driver_id));
end $$;

-- ── Administración ──────────────────────────────────────────────────────────────────────────────────────────────
create function private.admin_driver_profile(driver_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare pay private.driver_payout;
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 select * into pay from private.driver_payout p where p.driver_id = admin_driver_profile.driver_id;
 return jsonb_build_object(
  'vehicle', (select jsonb_build_object('plate', plate, 'model', model, 'color', color) from private.driver_vehicles v where v.driver_id = admin_driver_profile.driver_id),
  'payout', case when pay.driver_id is not null then jsonb_build_object('bank', pay.bank, 'id_number', pay.id_number, 'phone', pay.phone) end,
  'duplicates', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email)) from private.driver_payout o join auth.users u on u.id = o.driver_id
    where pay.driver_id is not null and o.driver_id <> pay.driver_id and o.bank = pay.bank and o.phone = pay.phone), '[]'::jsonb),
  'plan', private.plan_state(admin_driver_profile.driver_id));
end $$;

create function private.admin_plan_overview() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 return jsonb_build_object(
  'drivers', coalesce((select jsonb_object_agg(p.id, jsonb_build_object('status', private.plan_state(p.id)->>'status', 'paid_until', d.paid_until,
     'duplicate', exists (select 1 from private.driver_payout a join private.driver_payout b on a.bank = b.bank and a.phone = b.phone and a.driver_id <> b.driver_id where a.driver_id = p.id)))
    from public.profiles p left join private.driver_subscriptions d on d.driver_id = p.id where p.role = 'driver'), '{}'::jsonb),
  'pending', coalesce((select jsonb_agg(x order by x.created_at) from (
    select sp.id, sp.driver_id, sp.plan, sp.days, sp.amount_cents, sp.amount_bs, sp.method, sp.reference, sp.bank, sp.phone, sp.note, sp.created_at,
     coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'), ''), u.email) as name
    from private.subscription_payments sp join auth.users u on u.id = sp.driver_id where sp.status in ('checking', 'review') order by sp.created_at limit 100) x), '[]'::jsonb),
  'collected_30d_cents', coalesce((select sum(amount_cents) from private.subscription_payments where status = 'approved' and method in ('pago_movil', 'binance', 'admin') and created_at > now() - interval '30 days'), 0),
  'payments_30d', (select count(*) from private.subscription_payments where status = 'approved' and method in ('pago_movil', 'binance', 'admin') and created_at > now() - interval '30 days'));
end $$;

create function private.admin_plan_extend(driver_id uuid, add_days integer, amount_cents integer, note text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 if add_days not between 1 and 366 or coalesce(amount_cents, 0) not between 0 and 100000 then raise exception 'Valores inválidos'; end if;
 if not exists (select 1 from public.profiles p where p.id = admin_plan_extend.driver_id and p.role = 'driver') then raise exception 'Conductor no encontrado'; end if;
 insert into private.subscription_payments(driver_id, plan, days, amount_cents, method, status, note, reviewed_at, reviewed_by)
 values(driver_id, case when coalesce(amount_cents, 0) > 0 then case when add_days >= 30 then 'month' else 'week' end else 'gift' end, add_days, coalesce(amount_cents, 0), 'admin', 'approved',
        coalesce(nullif(left(btrim(coalesce(note, '')), 300), ''), case when coalesce(amount_cents, 0) > 0 then 'Pago registrado por la administración' else 'Días regalados' end), now(), auth.uid());
 perform private.extend_plan(driver_id, add_days);
 return private.plan_state(driver_id);
end $$;

create function private.admin_plan_review(payment_id uuid, approve boolean) returns void language plpgsql security definer set search_path = '' as $$
declare sp private.subscription_payments;
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 select * into sp from private.subscription_payments where id = payment_id and status in ('checking', 'review') for update;
 if sp.id is null then raise exception 'Pago no encontrado'; end if;
 update private.subscription_payments set status = case when approve then 'approved' else 'rejected' end, reviewed_at = now(), reviewed_by = auth.uid(),
  locked_until = null, lease = null, note = case when approve then 'Aprobado manualmente' else 'Rechazado por la administración' end where id = sp.id;
 if approve then perform private.extend_plan(sp.driver_id, sp.days); end if;
end $$;

create function private.admin_subscription_settings(payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare wa text := regexp_replace(coalesce(payload->>'whatsapp', ''), '[^0-9]', '', 'g');
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 if wa !~ '^0[0-9]{10}$' then raise exception 'WhatsApp inválido'; end if;
 update public.service_settings set
  billing_mode = coalesce(payload->>'billing_mode', billing_mode),
  sub_week_cents = coalesce((payload->>'week_cents')::integer, sub_week_cents),
  sub_month_cents = coalesce((payload->>'month_cents')::integer, sub_month_cents),
  sub_trial_enabled = coalesce((payload->>'trial_enabled')::boolean, sub_trial_enabled),
  sub_trial_days = coalesce((payload->>'trial_days')::integer, sub_trial_days),
  sub_grace_hours = coalesce((payload->>'grace_hours')::integer, sub_grace_hours),
  sub_auto_activation = coalesce((payload->>'auto_activation')::boolean, sub_auto_activation),
  sub_whatsapp = wa
 where id = 1;
end $$;

-- ── Avisos de vencimiento y desconexión de planes vencidos (cada hora) ─────────────────────────────────────────
create function private.plan_reminders() returns void language plpgsql security definer set search_path = '' as $$
declare r record; s public.service_settings; title text; body text;
begin
 select * into strict s from public.service_settings where id = 1;
 if s.billing_mode <> 'subscription' then return; end if;
 for r in select d.* from private.driver_subscriptions d join public.profiles p on p.id = d.driver_id
   where p.role = 'driver' and not p.suspended and d.paid_until is not null
    and ((d.paid_until - now() <= interval '2 days' and d.paid_until > now() + interval '20 hours' and d.reminded_2d_for is distinct from d.paid_until)
      or (d.paid_until - now() <= interval '20 hours' and d.paid_until > now() - interval '1 hour' and d.reminded_0d_for is distinct from d.paid_until)) loop
  if r.paid_until - now() > interval '20 hours' then
   title := 'Tu plan vence pronto'; body := 'Tu plan de De1na vence en 2 días. Renuévalo en «Mi plan» para seguir recibiendo viajes.';
   update private.driver_subscriptions set reminded_2d_for = r.paid_until where driver_id = r.driver_id;
  else
   title := 'Tu plan vence hoy'; body := 'Renueva tu plan en «Mi plan». Tendrás ' || s.sub_grace_hours || ' horas de gracia después del vencimiento.';
   update private.driver_subscriptions set reminded_0d_for = r.paid_until where driver_id = r.driver_id;
  end if;
  insert into public.notification_inbox(user_id, id, title, body) values(r.driver_id, 'plan:' || r.driver_id || ':' || extract(epoch from now())::bigint, title, body) on conflict do nothing;
  insert into private.push_jobs(device_id, recipient_id, kind, title, body, tag, expires_at)
  select id, user_id, 'test', title, body, 'plan-' || r.driver_id, now() + interval '12 hours' from private.push_devices where user_id = r.driver_id;
 end loop;
 update public.profiles p set available = false where p.role = 'driver' and p.available and private.plan_blocked(p.id)
  and not exists (select 1 from public.trips t where t.driver_id = p.id and t.status in ('assigned', 'arrived', 'ongoing'));
 perform private.wake_push();
end $$;
select cron.schedule('de1na-plan-reminders', '7 * * * *', 'select private.plan_reminders()');

-- ── Permisos y envoltorios públicos ─────────────────────────────────────────────────────────────────────────────
revoke all on function private.extend_plan(uuid, integer), private.plan_blocked(uuid), private.claim_trial(uuid, text), private.plan_state(uuid),
 private.require_driver_data(), private.trip_billing_mode(), private.plan_reminders() from public, anon, authenticated;
do $$declare f text;begin
 foreach f in array array['my_driver_data()', 'save_my_vehicle(text,text,text)', 'save_my_payout(text,text,text)', 'my_plan(text)',
  'request_plan_payment(text,text,text,text)', 'admin_driver_profile(uuid)', 'admin_plan_overview()', 'admin_plan_extend(uuid,integer,integer,text)',
  'admin_plan_review(uuid,boolean)', 'admin_subscription_settings(jsonb)'] loop
  execute format('revoke all on function private.%s from public, anon', f);
  execute format('grant execute on function private.%s to authenticated', f);
 end loop;
end $$;
create function public.my_driver_data() returns jsonb language sql security invoker set search_path = '' as $$ select private.my_driver_data() $$;
create function public.save_my_vehicle(plate text, model text, color text) returns jsonb language sql security invoker set search_path = '' as $$ select private.save_my_vehicle(plate, model, color) $$;
create function public.save_my_payout(bank text, id_number text, phone text) returns jsonb language sql security invoker set search_path = '' as $$ select private.save_my_payout(bank, id_number, phone) $$;
create function public.my_plan(device text default null) returns jsonb language sql security invoker set search_path = '' as $$ select private.my_plan(device) $$;
create function public.request_plan_payment(plan text, reference text, bank text, phone text) returns jsonb language sql security invoker set search_path = '' as $$ select private.request_plan_payment(plan, reference, bank, phone) $$;
create function public.admin_driver_profile(driver_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_driver_profile(driver_id) $$;
create function public.admin_plan_overview() returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_plan_overview() $$;
create function public.admin_plan_extend(driver_id uuid, add_days integer, amount_cents integer, note text) returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_plan_extend(driver_id, add_days, amount_cents, note) $$;
create function public.admin_plan_review(payment_id uuid, approve boolean) returns void language sql security invoker set search_path = '' as $$ select private.admin_plan_review(payment_id, approve) $$;
create function public.admin_subscription_settings(payload jsonb) returns void language sql security invoker set search_path = '' as $$ select private.admin_subscription_settings(payload) $$;
do $$declare f text;begin
 foreach f in array array['my_driver_data()', 'save_my_vehicle(text,text,text)', 'save_my_payout(text,text,text)', 'my_plan(text)',
  'request_plan_payment(text,text,text,text)', 'admin_driver_profile(uuid)', 'admin_plan_overview()', 'admin_plan_extend(uuid,integer,integer,text)',
  'admin_plan_review(uuid,boolean)', 'admin_subscription_settings(jsonb)'] loop
  execute format('revoke all on function public.%s from public, anon', f);
  execute format('grant execute on function public.%s to authenticated', f);
 end loop;
end $$;
