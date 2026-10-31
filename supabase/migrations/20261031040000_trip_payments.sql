-- Métodos de pago del viaje: efectivo (al motorizado) o pago móvil (a la cuenta configurada por la administración).
-- El precio sigue en USD; para pago móvil se guarda la tasa vigente al solicitar, de modo que el monto en Bs no cambie.
alter table public.service_settings
 add column pago_movil_bank text check (pago_movil_bank is null or length(btrim(pago_movil_bank)) between 2 and 80),
 add column pago_movil_phone text check (pago_movil_phone is null or pago_movil_phone ~ '^[0-9]{11}$'),
 add column pago_movil_id text check (pago_movil_id is null or pago_movil_id ~ '^[VEJGP][0-9]{5,10}$'),
 add column exchange_rate numeric(14,4) check (exchange_rate is null or exchange_rate > 0),
 add column exchange_rate_updated_at timestamptz;

alter table public.trips
 add column payment_method text not null default 'cash' check (payment_method in ('cash', 'pago_movil')),
 add column exchange_rate numeric(14,4) check (exchange_rate is null or exchange_rate > 0),
 add column payment_reference text check (payment_reference is null or payment_reference ~ '^[0-9]{4,20}$'),
 add column payment_reported_at timestamptz,
 add constraint trips_pago_movil_rate check (payment_method <> 'pago_movil' or exchange_rate is not null);

-- La solicitud recibe el método elegido; pago móvil exige datos y tasa configurados.
create or replace function private.insert_quoted_trip(payload jsonb)
 returns void language plpgsql security definer set search_path to '' as $function$
declare q jsonb; secret text; signed_text text := payload->>'quote'; method text := coalesce(payload->>'payment_method', 'cash'); s public.service_settings;
begin
  if auth.uid() is null or signed_text is null or length(signed_text)>4096 then raise exception 'Cotizacion requerida'; end if;
  select k.secret into strict secret from private.fare_key k where id=1;
  if encode(extensions.hmac(signed_text,secret,'sha256'),'hex') is distinct from payload->>'signature' then raise exception 'Cotizacion invalida'; end if;
  q := signed_text::jsonb;
  if (q->>'user_id')::uuid is distinct from auth.uid() or q->>'currency' is distinct from 'USD'
     or (q->>'expires_at')::bigint is null or (q->>'expires_at')::bigint <= extract(epoch from now())
     or (q->>'expires_at')::bigint > extract(epoch from now())+301 then raise exception 'Cotizacion vencida'; end if;
  if method not in ('cash', 'pago_movil') then raise exception 'Metodo de pago invalido'; end if;
  select * into strict s from public.service_settings where id=1;
  if method = 'pago_movil' and (s.pago_movil_bank is null or s.pago_movil_phone is null or s.pago_movil_id is null or s.exchange_rate is null) then
    raise exception 'Pago movil no disponible';
  end if;
  insert into public.trips(passenger_id,origin,destination,zone,fare_cents,currency,distance_meters,duration_seconds,quote_id,payment_method,exchange_rate)
  values(auth.uid(),q->>'origin',q->>'destination',null,(q->>'fare_cents')::integer,'USD',(q->>'distance_meters')::integer,(q->>'duration_seconds')::integer,(q->>'id')::uuid,
         method, case when method = 'pago_movil' then s.exchange_rate end);
end;$function$;

-- Datos de pago móvil y tasa, solo administración. Valores vacíos desactivan el pago móvil.
create function private.save_payment_settings(bank text, phone text, id_number text, rate numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.service_settings;
begin
 if uid is null or not exists (select 1 from public.profiles where id = uid and role = 'admin' and not suspended) then raise exception 'No autorizado'; end if;
 perform pg_advisory_xact_lock(4173001);
 select * into strict s from public.service_settings where id = 1 for update;
 update public.service_settings set
  pago_movil_bank = nullif(btrim(bank), ''),
  pago_movil_phone = nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), ''),
  pago_movil_id = nullif(upper(regexp_replace(coalesce(id_number, ''), '[^0-9A-Za-z]', '', 'g')), ''),
  exchange_rate = rate,
  exchange_rate_updated_at = case when rate is distinct from s.exchange_rate then now() else s.exchange_rate_updated_at end
 where id = 1;
end $$;
revoke all on function private.save_payment_settings(text, text, text, numeric) from public, anon;
grant execute on function private.save_payment_settings(text, text, text, numeric) to authenticated;
create function public.save_payment_settings(bank text, phone text, id_number text, rate numeric) returns void
language sql security invoker set search_path = '' as $$ select private.save_payment_settings(bank, phone, id_number, rate) $$;
revoke all on function public.save_payment_settings(text, text, text, numeric) from public, anon;
grant execute on function public.save_payment_settings(text, text, text, numeric) to authenticated;

-- El pasajero informa la referencia del pago móvil una vez aceptado el viaje (puede corregirla).
create function private.report_payment(trip_id uuid, reference text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.trips; clean text := regexp_replace(coalesce(reference, ''), '[^0-9]', '', 'g');
begin
 if uid is null then raise exception 'No autorizado'; end if;
 select * into t from public.trips where id = report_payment.trip_id and passenger_id = uid for update;
 if t.id is null or t.payment_method <> 'pago_movil' then raise exception 'Este viaje no usa pago móvil'; end if;
 if t.status not in ('assigned', 'arrived', 'ongoing', 'finished') then raise exception 'Espera a que un motorizado acepte el viaje'; end if;
 if clean !~ '^[0-9]{4,20}$' then raise exception 'Referencia inválida'; end if;
 update public.trips set payment_reference = clean, payment_reported_at = now() where id = t.id;
end $$;
revoke all on function private.report_payment(uuid, text) from public, anon;
grant execute on function private.report_payment(uuid, text) to authenticated;
create function public.report_payment(trip_id uuid, reference text) returns void
language sql security invoker set search_path = '' as $$ select private.report_payment(trip_id, reference) $$;
revoke all on function public.report_payment(uuid, text) from public, anon;
grant execute on function public.report_payment(uuid, text) to authenticated;
