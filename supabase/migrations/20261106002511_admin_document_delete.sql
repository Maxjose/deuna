-- Only admins may remove a submitted document; never target a newer upload.
do $migration$
declare definition text;changed text;
begin
 select pg_get_functiondef('private.driver_documents_api(text,jsonb)'::regprocedure) into definition;
 changed:=replace(definition,'elsif action=''review'' then',
 'elsif action=''delete'' then
  if p.role<>''admin'' then raise exception ''No autorizado'';end if;
  if split_part(payload->>''path'',''/'',1) is distinct from target::text or split_part(payload->>''path'',''/'',2) is distinct from payload->>''kind'' then raise exception ''Archivo invalido'';end if;
  select * into doc from private.driver_documents where driver_id=target and kind=payload->>''kind'';
  if found and doc.path is distinct from payload->>''path'' then raise exception ''Documento actualizado'';end if;
  delete from private.driver_documents where driver_id=target and kind=payload->>''kind'' and path=payload->>''path'';
 elsif action=''review'' then');
 if changed=definition then raise exception 'Missing document review insertion point';end if;
 execute changed;
end $migration$;
-- An admin can remove the unlinked file through Storage, like its owner.
alter policy "driver documents cleanup" on storage.objects using(bucket_id='driver-documents' and private.document_access(name) and private.document_unused(name));
