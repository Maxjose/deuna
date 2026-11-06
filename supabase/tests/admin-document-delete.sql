begin;
do $test$
declare admin_id uuid:=gen_random_uuid();driver uuid:=gen_random_uuid();path text;kind text;r jsonb;denied boolean;
begin
 insert into auth.users(id) values(admin_id),(driver);
 update public.profiles set role='admin' where id=admin_id;
 update public.profiles set role='driver',approved=true,available=true where id=driver;
 foreach kind in array array['circulation','liability','quarters','license','medical'] loop
  path:=driver::text||'/'||kind||'/'||gen_random_uuid()::text||'.pdf';
  insert into storage.objects(bucket_id,name,metadata) values('driver-documents',path,'{"size":100,"mimetype":"application/pdf"}');
  insert into private.driver_documents(driver_id,kind,path,status) values(driver,kind,path,'approved');
 end loop;
 assert private.documents_ready(driver),'All approved initially';
 perform set_config('request.jwt.claim.sub',driver::text,true);
 denied:=false;
 begin perform public.driver_documents('delete',jsonb_build_object('kind','medical','path',path));exception when others then denied:=true;end;
 assert denied,'Driver cannot delete submitted documents';
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 denied:=false;
 begin perform public.driver_documents('delete',jsonb_build_object('driver_id',driver,'kind','medical','path',driver::text||'/medical/old.pdf'));exception when others then denied:=sqlerrm='Documento actualizado';end;
 assert denied,'Stale deletion does not remove current upload';
 r:=public.driver_documents('delete',jsonb_build_object('driver_id',driver,'kind','medical','path',path));
 assert jsonb_array_length(r->'documents')=4,'Document removed from list';
 assert not private.documents_ready(driver),'Deleting revokes eligibility';
 assert not (select available from public.profiles where id=driver),'Idle driver disconnected';
 assert private.document_unused(path) and private.document_access(path),'Admin may remove unlinked storage file';
 r:=public.driver_documents('delete',jsonb_build_object('driver_id',driver,'kind','medical','path',path));
 assert jsonb_array_length(r->'documents')=4,'Storage cleanup can be retried';
 r:=public.driver_documents('exempt',jsonb_build_object('driver_id',driver,'enabled',true));
 assert (r->>'ready')::boolean,'Explicit exemption still applies';
end $test$;
rollback;
