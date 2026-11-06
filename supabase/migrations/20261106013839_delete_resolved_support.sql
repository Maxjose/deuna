do $migration$
declare definition text;changed text;
begin
 select pg_get_functiondef('private.support_api(text,jsonb)'::regprocedure) into definition;
 changed:=replace(definition,'if action=''claim'' then',
 'if action=''delete'' then
  if not is_staff or t.status<>''resolved'' or payload->>''confirmation'' is distinct from ''ELIMINAR'' then raise exception ''Borrado no autorizado'';end if;
  delete from private.support_threads where id=t.id;
  return jsonb_build_object(''deleted'',true);
 elsif action=''claim'' then');
 if changed=definition then raise exception 'Missing support insertion point';end if;
 execute changed;
end $migration$;
