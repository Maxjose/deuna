begin;
do $test$
declare a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();thread uuid;denied boolean;
begin
 insert into auth.users(id) values(a),(u);
 update public.profiles set role='admin' where id=a;
 insert into private.support_threads(user_id,subject) values(u,'Consulta de prueba') returning id into thread;
 perform set_config('request.jwt.claim.sub',a::text,true);
 denied:=false;begin perform public.support('delete',jsonb_build_object('id',thread,'confirmation','ELIMINAR'));exception when others then denied:=true;end;
 assert denied,'Waiting conversations cannot be deleted';
 update private.support_threads set status='active',assigned_to=a where id=thread;
 denied:=false;begin perform public.support('delete',jsonb_build_object('id',thread,'confirmation','ELIMINAR'));exception when others then denied:=true;end;
 assert denied,'Active conversations cannot be deleted';
 update private.support_threads set status='resolved' where id=thread;
 insert into private.support_messages(id,thread_id,sender_id,staff,body) values(gen_random_uuid(),thread,u,false,'Mensaje de prueba');
 perform set_config('request.jwt.claim.sub',u::text,true);
 denied:=false;begin perform public.support('delete',jsonb_build_object('id',thread,'confirmation','ELIMINAR'));exception when others then denied:=true;end;
 assert denied,'Owner cannot delete support history';
 perform set_config('request.jwt.claim.sub',a::text,true);
 denied:=false;begin perform public.support('delete',jsonb_build_object('id',thread));exception when others then denied:=true;end;
 assert denied,'Explicit confirmation required';
 perform public.support('delete',jsonb_build_object('id',thread,'confirmation','ELIMINAR'));
 assert not exists(select 1 from private.support_threads where id=thread),'Resolved conversation removed';
 assert not exists(select 1 from private.support_messages where thread_id=thread),'Messages removed with conversation';
end $test$;
rollback;
