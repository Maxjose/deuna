-- Remove files through Storage before deleting the Auth user that owns them.
create function private.prepare_document_deletion(confirmation text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();paths jsonb;
begin
 if uid is null then raise exception 'No autorizado';end if;
 perform pg_advisory_xact_lock(4173001);
 if upper(btrim(coalesce(confirmation,'')))<>'ELIMINAR' then raise exception 'Confirmación inválida';end if;
 if (select role from public.profiles where id=uid)='admin' then raise exception 'Las cuentas de administración no se eliminan desde aquí';end if;
 if exists(select 1 from public.trips where (passenger_id=uid or driver_id=uid) and status in ('searching','assigned','arrived','ongoing')) then raise exception 'Tienes un viaje activo';end if;
 if exists(select 1 from private.debt_trips(uid)) then raise exception 'Tienes un saldo pendiente';end if;
 if private.driver_balance(uid)>0 then raise exception 'Tienes ganancias por cobrar';end if;
 select coalesce(jsonb_agg(name),'[]') into paths from storage.objects where bucket_id='driver-documents' and split_part(name,'/',1)=uid::text;
 delete from private.driver_documents where driver_id=uid;
 delete from private.driver_document_exemptions where driver_id=uid;
 update public.profiles set available=false where id=uid and role='driver';
 return paths;
end $$;
revoke all on function private.prepare_document_deletion(text) from public,anon;
grant execute on function private.prepare_document_deletion(text) to authenticated;
create function public.prepare_document_deletion(confirmation text) returns jsonb language sql security invoker set search_path='' as $$select private.prepare_document_deletion(confirmation)$$;
revoke all on function public.prepare_document_deletion(text) from public,anon;
grant execute on function public.prepare_document_deletion(text) to authenticated;
