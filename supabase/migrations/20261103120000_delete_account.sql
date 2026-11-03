-- Eliminación de cuenta (exigida por Google Play): desde la app o la web.
-- Si la persona no tiene viajes, se borra por completo. Si tiene, se anonimizan sus datos personales y se cierra
-- el acceso; los viajes se conservan sin datos de contacto por obligaciones contables y de seguridad.
create function private.delete_my_account(confirmation text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); has_trips boolean;
begin
 if uid is null then raise exception 'No autorizado'; end if;
 if upper(btrim(coalesce(confirmation, ''))) <> 'ELIMINAR' then raise exception 'Confirmación inválida'; end if;
 if exists (select 1 from public.trips where (passenger_id = uid or driver_id = uid) and status in ('searching', 'assigned', 'arrived', 'ongoing')) then raise exception 'Tienes un viaje activo'; end if;
 if exists (select 1 from private.debt_trips(uid)) then raise exception 'Tienes un saldo pendiente'; end if;
 if private.driver_balance(uid) > 0 then raise exception 'Tienes ganancias por cobrar'; end if;
 if (select role from public.profiles where id = uid) = 'admin' then raise exception 'Las cuentas de administración no se eliminan desde aquí'; end if;
 has_trips := exists (select 1 from public.trips where passenger_id = uid or driver_id = uid)
  or exists (select 1 from private.trip_ratings where passenger_id = uid or driver_id = uid)
  or exists (select 1 from private.passenger_ratings where passenger_id = uid or driver_id = uid);
 if not has_trips then
  delete from auth.users where id = uid;
  return jsonb_build_object('deleted', true, 'mode', 'full');
 end if;
 -- Anonimizar: sin correo, nombre, teléfono, datos de pago, dispositivos ni acceso.
 delete from private.push_devices where user_id = uid;
 delete from public.favorite_places where user_id = uid;
 delete from public.passenger_payment_preferences where user_id = uid;
 delete from public.notification_inbox where user_id = uid;
 delete from private.tracking_tokens where driver_id = uid;
 delete from public.trip_locations where driver_id = uid;
 update public.trips set payment_phone = null, payment_bank = null where passenger_id = uid;
 update public.profiles set suspended = true, available = false where id = uid;
 delete from auth.identities where user_id = uid;
 delete from auth.sessions where user_id = uid;
 delete from auth.webauthn_credentials where user_id = uid;
 update auth.users set email = 'eliminado-' || uid || '@cuentas.de1na.app', phone = null, raw_user_meta_data = '{}'::jsonb,
  encrypted_password = null, email_confirmed_at = null, banned_until = 'infinity', deleted_at = now(), updated_at = now() where id = uid;
 return jsonb_build_object('deleted', true, 'mode', 'anonymized');
end $$;
revoke all on function private.delete_my_account(text) from public, anon;
grant execute on function private.delete_my_account(text) to authenticated;
create function public.delete_my_account(confirmation text) returns jsonb language sql security invoker set search_path = '' as $$ select private.delete_my_account(confirmation) $$;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
