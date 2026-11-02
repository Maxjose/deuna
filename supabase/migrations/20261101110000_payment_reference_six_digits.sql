-- Normalize new reports only. Existing reported payments keep their original reference.
do $$declare definition text;marker text:='clean text := regexp_replace(coalesce(reference, ''''), ''[^0-9]'', '''', ''g'');';begin
 select pg_get_functiondef('private.report_payment(uuid,text,text,text,numeric)'::regprocedure) into definition;
 if position(marker in definition)=0 then raise exception 'Missing payment reference insertion point';end if;
 definition:=replace(definition,marker,'clean text := right(regexp_replace(coalesce(reference, ''''), ''[^0-9]'', '''', ''g''),6);');
 definition:=replace(definition,'''^[0-9]{4,20}$''','''^[0-9]{6}$''');
 execute definition;
end $$;
