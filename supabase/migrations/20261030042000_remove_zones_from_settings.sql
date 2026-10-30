-- Keep historical zones; stop requiring or writing them in service configuration.
do $migration$
declare definition text; old_clause text := ',zones=array(select jsonb_array_elements_text(payload->''zones''))';
begin
  select pg_get_functiondef('private.operate(text,jsonb)'::regprocedure) into definition;
  if position(old_clause in definition)=0 then raise exception 'Unexpected settings function';end if;
  execute replace(definition,old_clause,'');
end;$migration$;
