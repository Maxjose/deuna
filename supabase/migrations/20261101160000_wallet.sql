-- Saldo de cuenta (monedero): reembolsos de viajes pagados que se cancelan, pago de viajes con saldo,
-- abonos/cargos de la administración y recargas (implementadas, desactivadas por defecto).
alter table public.trips drop constraint if exists trips_payment_method_check;
alter table public.trips add constraint trips_payment_method_check check (payment_method in ('cash', 'pago_movil', 'wallet'));
alter table public.trips drop constraint if exists trips_payment_verified_by_check;
alter table public.trips add constraint trips_payment_verified_by_check check (payment_verified_by is null or payment_verified_by in ('auto', 'admin', 'wallet'));
alter table public.service_settings add column wallet_topup_enabled boolean not null default false;

create table private.wallet_ledger(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 amount_cents integer not null check (amount_cents <> 0),
 kind text not null check (kind in ('refund', 'trip_payment', 'admin_credit', 'admin_debit', 'topup')),
 trip_id uuid,
 note text check (length(note) <= 200),
 created_by uuid,
 created_at timestamptz not null default now()
);
create index wallet_ledger_user on private.wallet_ledger(user_id, created_at desc);
create unique index wallet_ledger_refund_once on private.wallet_ledger(trip_id) where kind = 'refund';
create unique index wallet_ledger_payment_once on private.wallet_ledger(trip_id) where kind = 'trip_payment';

create table private.wallet_topups(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 amount_cents integer not null check (amount_cents between 100 and 100000),
 amount_bs numeric(14,2),
 reference text not null check (reference ~ '^[0-9]{4,20}$'),
 bank text check (bank ~ '^[0-9]{4}$'),
 phone text check (phone ~ '^0[0-9]{10}$'),
 status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid
);
create index wallet_topups_pending on private.wallet_topups(created_at) where status = 'pending';

create function private.wallet_balance(person uuid) returns integer language sql stable security definer set search_path = '' as $$
 select coalesce(sum(amount_cents), 0)::integer from private.wallet_ledger where user_id = person
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not suspended)
$$;
revoke all on function private.wallet_balance(uuid), private.is_admin() from public, anon, authenticated;

-- Pago con saldo al solicitar: se descuenta al crear el viaje y queda pagado.
create function private.wallet_pay_trip() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.payment_method <> 'wallet' then return new; end if;
 if new.fare_cents is null or new.fare_cents <= 0 then raise exception 'Monto inválido'; end if;
 perform pg_advisory_xact_lock(hashtext('wallet:' || new.passenger_id::text));
 if private.wallet_balance(new.passenger_id) < new.fare_cents then raise exception 'Saldo insuficiente'; end if;
 insert into private.wallet_ledger(user_id, amount_cents, kind, trip_id, note) values(new.passenger_id, -new.fare_cents, 'trip_payment', new.id, 'Pago de viaje con saldo');
 new.payment_status := 'verified'; new.payment_verified_at := now(); new.payment_verified_by := 'wallet'; new.payment_note := 'Pagado con saldo';
 return new;
end $$;
create trigger wallet_pay_trip before insert on public.trips for each row execute function private.wallet_pay_trip();

-- Reembolso al saldo: viaje pagado (pago móvil verificado o saldo) que termina cancelado. Una sola vez por viaje.
create function private.wallet_refund_trip() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status = 'cancelled' and new.payment_status = 'verified' and new.payment_method in ('pago_movil', 'wallet') and new.fare_cents > 0
    and (old.status is distinct from 'cancelled' or old.payment_status is distinct from 'verified') then
  insert into private.wallet_ledger(user_id, amount_cents, kind, trip_id, note)
  values(new.passenger_id, new.fare_cents, 'refund', new.id, 'Reembolso por viaje cancelado') on conflict do nothing;
 end if;
 return new;
end $$;
create trigger wallet_refund_trip after update of status, payment_status on public.trips for each row execute function private.wallet_refund_trip();
revoke all on function private.wallet_pay_trip(), private.wallet_refund_trip() from public, anon, authenticated;

-- Aceptar 'wallet' como método al solicitar.
do $$declare definition text; marker text := 'if method not in (''cash'', ''pago_movil'')';begin
 select pg_get_functiondef('private.insert_quoted_trip(jsonb)'::regprocedure) into definition;
 if position(marker in definition) = 0 then raise exception 'Missing request method check'; end if;
 execute replace(definition, marker, 'if method not in (''cash'', ''pago_movil'', ''wallet'')');
end $$;

-- Mi saldo (pasajero).
create function private.my_wallet() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
 if uid is null then raise exception 'No autorizado'; end if;
 return jsonb_build_object(
  'balance_cents', private.wallet_balance(uid),
  'topup_enabled', (select wallet_topup_enabled from public.service_settings where id = 1),
  'movements', coalesce((select jsonb_agg(m order by m.created_at desc) from (select id, amount_cents, kind, trip_id, note, created_at from private.wallet_ledger where user_id = uid order by created_at desc limit 50) m), '[]'::jsonb),
  'topups', coalesce((select jsonb_agg(x order by x.created_at desc) from (select id, amount_cents, reference, status, created_at from private.wallet_topups where user_id = uid order by created_at desc limit 10) x), '[]'::jsonb));
end $$;

-- Pagar un saldo pendiente (pago móvil no verificado) con el saldo de la cuenta.
create function private.wallet_settle_trip(trip_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.trips;
begin
 if uid is null then raise exception 'No autorizado'; end if;
 perform pg_advisory_xact_lock(hashtext('wallet:' || uid::text));
 select * into t from public.trips where id = wallet_settle_trip.trip_id and passenger_id = uid for update;
 if t.id is null or t.payment_method <> 'pago_movil' or t.status <> 'finished' or t.payment_status = 'verified' then raise exception 'Este viaje no tiene saldo pendiente'; end if;
 if private.wallet_balance(uid) < t.fare_cents then raise exception 'Saldo insuficiente'; end if;
 insert into private.wallet_ledger(user_id, amount_cents, kind, trip_id, note) values(uid, -t.fare_cents, 'trip_payment', t.id, 'Pago de saldo pendiente');
 update public.trips set payment_status = 'verified', payment_verified_at = now(), payment_verified_by = 'wallet', payment_note = 'Pagado con saldo',
  payment_locked_until = null, payment_lease = null where id = t.id;
 return jsonb_build_object('balance_cents', private.wallet_balance(uid));
end $$;

-- Recarga: el usuario informa un pago móvil; la administración la aprueba. Solo si está activada.
create function private.wallet_request_topup(amount_cents integer, reference text, bank text, phone text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.service_settings; clean text := right(regexp_replace(coalesce(reference, ''), '[^0-9]', '', 'g'), 6);
 clean_phone text := regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g');
begin
 if uid is null then raise exception 'No autorizado'; end if;
 select * into strict s from public.service_settings where id = 1;
 if not s.wallet_topup_enabled then raise exception 'Recargas no disponibles'; end if;
 if amount_cents is null or amount_cents < 100 or amount_cents > 100000 then raise exception 'Monto inválido'; end if;
 if clean !~ '^[0-9]{4,6}$' then raise exception 'Referencia inválida'; end if;
 if bank !~ '^[0-9]{4}$' then raise exception 'Banco inválido'; end if;
 if clean_phone !~ '^0[0-9]{10}$' then raise exception 'Teléfono inválido'; end if;
 if (select count(*) from private.wallet_topups w where w.user_id = uid and w.status = 'pending') >= 3 then raise exception 'Tienes recargas pendientes'; end if;
 if exists (select 1 from private.wallet_topups w where w.reference = clean and w.bank = wallet_request_topup.bank and w.status <> 'rejected')
    or exists (select 1 from public.trips tr where right(tr.payment_reference, 6) = clean and tr.payment_bank = wallet_request_topup.bank) then raise exception 'Esta referencia ya fue usada'; end if;
 insert into private.wallet_topups(user_id, amount_cents, amount_bs, reference, bank, phone)
 values(uid, amount_cents, case when s.exchange_rate is not null then round(amount_cents * s.exchange_rate / 100.0, 2) end, clean, bank, clean_phone);
 return jsonb_build_object('status', 'pending');
end $$;

-- Administración: ver y ajustar el saldo de una persona; revisar recargas; activar recargas.
create function private.admin_wallet(person_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 return jsonb_build_object('balance_cents', private.wallet_balance(person_id),
  'movements', coalesce((select jsonb_agg(m order by m.created_at desc) from (select id, amount_cents, kind, trip_id, note, created_at from private.wallet_ledger where user_id = person_id order by created_at desc limit 50) m), '[]'::jsonb));
end $$;

create function private.admin_wallet_adjust(person_id uuid, amount_cents integer, note text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare clean_note text := nullif(left(btrim(coalesce(note, '')), 200), '');
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 if amount_cents is null or amount_cents = 0 or abs(amount_cents) > 100000 then raise exception 'Monto inválido'; end if;
 if not exists (select 1 from auth.users where id = person_id) then raise exception 'Usuario no encontrado'; end if;
 perform pg_advisory_xact_lock(hashtext('wallet:' || person_id::text));
 if amount_cents < 0 and private.wallet_balance(person_id) + amount_cents < 0 then raise exception 'Saldo insuficiente'; end if;
 insert into private.wallet_ledger(user_id, amount_cents, kind, note, created_by)
 values(person_id, amount_cents, case when amount_cents > 0 then 'admin_credit' else 'admin_debit' end,
        coalesce(clean_note, case when amount_cents > 0 then 'Abono de la administración' else 'Cargo de la administración' end), auth.uid());
 return private.admin_wallet(person_id);
end $$;

create function private.admin_topups() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 return coalesce((select jsonb_agg(x order by x.created_at) from (
  select w.id, w.user_id, w.amount_cents, w.amount_bs, w.reference, w.bank, w.phone, w.created_at,
   coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'), ''), u.email) as name
  from private.wallet_topups w join auth.users u on u.id = w.user_id where w.status = 'pending' order by w.created_at limit 100) x), '[]'::jsonb);
end $$;

create function private.admin_review_topup(topup_id uuid, approve boolean) returns void language plpgsql security definer set search_path = '' as $$
declare w private.wallet_topups;
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 select * into w from private.wallet_topups where id = topup_id and status = 'pending' for update;
 if w.id is null then raise exception 'Recarga no encontrada'; end if;
 update private.wallet_topups set status = case when approve then 'approved' else 'rejected' end, reviewed_at = now(), reviewed_by = auth.uid() where id = w.id;
 if approve then insert into private.wallet_ledger(user_id, amount_cents, kind, note, created_by) values(w.user_id, w.amount_cents, 'topup', 'Recarga por pago móvil · Ref. ' || w.reference, auth.uid()); end if;
end $$;

create function private.admin_wallet_settings(topup_enabled boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado'; end if;
 update public.service_settings set wallet_topup_enabled = coalesce(topup_enabled, false) where id = 1;
end $$;

-- Envoltorios públicos.
do $$declare f text;begin
 foreach f in array array['my_wallet()', 'wallet_settle_trip(uuid)', 'wallet_request_topup(integer,text,text,text)', 'admin_wallet(uuid)',
  'admin_wallet_adjust(uuid,integer,text)', 'admin_topups()', 'admin_review_topup(uuid,boolean)', 'admin_wallet_settings(boolean)'] loop
  execute format('revoke all on function private.%s from public, anon', f);
  execute format('grant execute on function private.%s to authenticated', f);
 end loop;
end $$;
create function public.my_wallet() returns jsonb language sql security invoker set search_path = '' as $$ select private.my_wallet() $$;
create function public.wallet_settle_trip(trip_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.wallet_settle_trip(trip_id) $$;
create function public.wallet_request_topup(amount_cents integer, reference text, bank text, phone text) returns jsonb language sql security invoker set search_path = '' as $$ select private.wallet_request_topup(amount_cents, reference, bank, phone) $$;
create function public.admin_wallet(person_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_wallet(person_id) $$;
create function public.admin_wallet_adjust(person_id uuid, amount_cents integer, note text) returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_wallet_adjust(person_id, amount_cents, note) $$;
create function public.admin_topups() returns jsonb language sql security invoker set search_path = '' as $$ select private.admin_topups() $$;
create function public.admin_review_topup(topup_id uuid, approve boolean) returns void language sql security invoker set search_path = '' as $$ select private.admin_review_topup(topup_id, approve) $$;
create function public.admin_wallet_settings(topup_enabled boolean) returns void language sql security invoker set search_path = '' as $$ select private.admin_wallet_settings(topup_enabled) $$;
do $$declare f text;begin
 foreach f in array array['my_wallet()', 'wallet_settle_trip(uuid)', 'wallet_request_topup(integer,text,text,text)', 'admin_wallet(uuid)',
  'admin_wallet_adjust(uuid,integer,text)', 'admin_topups()', 'admin_review_topup(uuid,boolean)', 'admin_wallet_settings(boolean)'] loop
  execute format('revoke all on function public.%s from public, anon', f);
  execute format('grant execute on function public.%s to authenticated', f);
 end loop;
end $$;
