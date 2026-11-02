-- Pago móvil: el conductor no inicia el viaje sin la referencia del pasajero, y los pagos que no se verifican
-- en un tiempo prudencial (o rechazados) quedan como saldo pendiente que bloquea nuevas solicitudes.

-- Viajes con pago pendiente de un pasajero: rechazados, o sin verificar 60 minutos después de solicitar el viaje
-- (margen para bancos lentos). Reenviar una referencia no reinicia el plazo: el bloqueo sigue hasta que se verifique.
create function private.debt_trips(passenger uuid) returns setof public.trips language sql stable security definer set search_path = '' as $$
 select * from public.trips t
 where t.passenger_id = passenger and t.status = 'finished' and t.payment_method = 'pago_movil'
  and t.payment_status is distinct from 'verified'
  and (t.payment_status = 'rejected' or t.created_at < now() - interval '60 minutes')
$$;
revoke all on function private.debt_trips(uuid) from public, anon, authenticated;

create function private.my_balance() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
 if uid is null then raise exception 'No autorizado'; end if;
 return (select jsonb_build_object('amount_cents', coalesce(sum(d.fare_cents), 0), 'trips', coalesce(jsonb_agg(d.id order by d.created_at), '[]'::jsonb))
         from private.debt_trips(uid) d);
end $$;
revoke all on function private.my_balance() from public, anon;
grant execute on function private.my_balance() to authenticated;
create function public.my_balance() returns jsonb language sql security invoker set search_path = '' as $$ select private.my_balance() $$;
revoke all on function public.my_balance() from public, anon;
grant execute on function public.my_balance() to authenticated;

-- Bloquear nuevas solicitudes con saldo pendiente.
do $$declare definition text; marker text := '  if method not in (''cash'', ''pago_movil'')';begin
 select pg_get_functiondef('private.insert_quoted_trip(jsonb)'::regprocedure) into definition;
 if position(marker in definition) = 0 then raise exception 'Missing request insertion point'; end if;
 execute replace(definition, marker, '  if exists (select 1 from private.debt_trips(auth.uid())) then raise exception ''Saldo pendiente''; end if;' || chr(10) || marker);
end $$;

-- Iniciar el viaje (llegó → en curso) exige la referencia cuando el pago es por pago móvil.
do $$declare definition text; patched text;begin
 select pg_get_functiondef('private.operate(text,jsonb)'::regprocedure) into definition;
 patched := regexp_replace(definition,
  '(elsif action=''advance'' then\s+if p\.role<>''driver'' or not p\.approved or t\.driver_id is distinct from uid then raise exception ''No autorizado'';end if;)',
  '\1' || chr(10) || '   if t.status=''arrived'' and t.payment_method=''pago_movil'' and t.payment_reference is null then raise exception ''Falta referencia de pago'';end if;');
 if patched = definition then raise exception 'Missing advance insertion point'; end if;
 execute patched;
end $$;
