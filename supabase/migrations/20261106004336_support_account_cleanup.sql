do $migration$
declare definition text;changed text;
begin
 select pg_get_functiondef('private.delete_my_account(text)'::regprocedure) into definition;
 changed:=replace(definition,'has_trips := exists','delete from private.support_threads where user_id=uid;
 has_trips := exists');
 if changed=definition then raise exception 'Missing account cleanup insertion point';end if;
 execute changed;
end $migration$;
