-- La administración crea cuentas manualmente (correo confirmado, contraseña inicial, nombre, teléfono y rol).
create function private.admin_create_user(email text, password text, display_name text, phone text, role text, approved boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); new_id uuid := gen_random_uuid(); clean_email text := lower(btrim(coalesce(email, '')));
 meta jsonb;
begin
 if uid is null or not exists (select 1 from public.profiles where id = uid and profiles.role = 'admin' and not suspended) then raise exception 'No autorizado'; end if;
 if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(clean_email) > 254 then raise exception 'Correo inválido'; end if;
 if length(coalesce(password, '')) < 8 or length(password) > 72 then raise exception 'Contraseña inválida'; end if;
 if role not in ('passenger', 'driver') then raise exception 'Rol inválido'; end if;
 if exists (select 1 from auth.users u where lower(u.email) = clean_email) then raise exception 'Correo ya registrado'; end if;
 meta := jsonb_strip_nulls(jsonb_build_object('display_name', nullif(left(btrim(coalesce(display_name, '')), 80), ''),
  'contact_phone', nullif(left(btrim(coalesce(phone, '')), 30), ''), 'email_verified', true));
 insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
 values('00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated', clean_email, extensions.crypt(password, extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, meta, now(), now(), '', '', '', '', '', '', '', '');
 insert into auth.identities(user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
 values(new_id, new_id::text, 'email', jsonb_build_object('sub', new_id::text, 'email', clean_email, 'email_verified', true, 'phone_verified', false), now(), now(), null);
 update public.profiles set role = admin_create_user.role, approved = case when admin_create_user.role = 'driver' then coalesce(admin_create_user.approved, true) else profiles.approved end
 where id = new_id;
 return new_id;
end $$;
revoke all on function private.admin_create_user(text, text, text, text, text, boolean) from public, anon;
grant execute on function private.admin_create_user(text, text, text, text, text, boolean) to authenticated;
create function public.admin_create_user(email text, password text, display_name text, phone text, role text, approved boolean default true)
returns uuid language sql security invoker set search_path = '' as $$ select private.admin_create_user(email, password, display_name, phone, role, approved) $$;
revoke all on function public.admin_create_user(text, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_create_user(text, text, text, text, text, boolean) to authenticated;
