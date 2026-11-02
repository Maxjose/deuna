-- Administración: crear cuentas manualmente. Rollback.
begin;
do $test$
declare a uuid:=gen_random_uuid(); x uuid:=gen_random_uuid(); nid uuid; rejected boolean; u auth.users;
begin
  insert into auth.users(id) values(a),(x); update public.profiles set role='admin' where id=a;
  set local role authenticated; perform set_config('request.jwt.claim.sub',x::text,true);
  rejected:=false; begin perform public.admin_create_user('n@d.app','12345678','N','','passenger'); exception when raise_exception then rejected:=sqlerrm='No autorizado'; end;
  assert rejected,'Non-admin created user';
  perform set_config('request.jwt.claim.sub',a::text,true);
  nid:=public.admin_create_user(' Nuevo@De1na.app ','clave-segura','Nuevo Conductor','0412 1234567','driver',true);
  rejected:=false; begin perform public.admin_create_user('nuevo@de1na.app','12345678','Otro','','passenger'); exception when raise_exception then rejected:=sqlerrm='Correo ya registrado'; end;
  assert rejected,'Duplicate email';
  rejected:=false; begin perform public.admin_create_user('mal','12345678','X','','passenger'); exception when raise_exception then rejected:=sqlerrm='Correo inválido'; end;
  assert rejected,'Bad email';
  rejected:=false; begin perform public.admin_create_user('a@b.co','corta','X','','passenger'); exception when raise_exception then rejected:=sqlerrm='Contraseña inválida'; end;
  assert rejected,'Short password';
  rejected:=false; begin perform public.admin_create_user('a@b.co','12345678','X','','admin'); exception when raise_exception then rejected:=sqlerrm='Rol inválido'; end;
  assert rejected,'Admin role';
  reset role;
  select * into u from auth.users where users.id=nid;
  assert u.email='nuevo@de1na.app' and u.email_confirmed_at is not null and u.encrypted_password=extensions.crypt('clave-segura',u.encrypted_password),'User row';
  assert u.raw_user_meta_data->>'display_name'='Nuevo Conductor' and u.raw_user_meta_data->>'contact_phone'='0412 1234567','Metadata';
  assert exists(select 1 from auth.identities i where i.user_id=nid and i.provider='email'),'Identity';
  assert (select role='driver' and approved from public.profiles p where p.id=nid),'Profile';
  raise notice 'admin-create-user ok';
end
$test$;
rollback;
