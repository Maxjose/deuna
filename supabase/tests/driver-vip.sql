begin;
do $test$
#variable_conflict use_variable
declare admin_id uuid:=gen_random_uuid();driver_id uuid:=gen_random_uuid();regular uuid:=gen_random_uuid();passenger uuid:=gen_random_uuid();r jsonb;rejected boolean:=false;
begin
 insert into auth.users(id) values(admin_id),(driver_id),(regular),(passenger);
 update public.profiles set role='admin' where id=admin_id;
 update public.profiles set role='driver',approved=true,available=true where id in(driver_id,regular);
 perform set_config('request.jwt.claim.sub',passenger::text,true);
 begin perform public.driver_presence('vip_save',jsonb_build_object('driver_id',driver_id,'enabled',true));exception when others then rejected:=true;end;
 assert rejected,'Passenger cannot enable VIP';
 perform set_config('request.jwt.claim.sub',driver_id::text,true);
 rejected:=false;
 begin perform public.driver_presence('vip_save',jsonb_build_object('driver_id',driver_id,'enabled',true));exception when others then rejected:=true;end;
 assert rejected,'Driver cannot enable VIP';
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 r:=public.driver_presence('vip_save',jsonb_build_object('driver_id',driver_id,'enabled',true));
 assert (r->>'enabled')::boolean,'Admin enables VIP';
 update private.driver_presence set last_seen=now()-interval '2 days',last_activity=now()-interval '2 days' where driver_presence.driver_id in(driver_id,regular);
 perform private.expire_driver_presence(driver_id);
 perform private.expire_driver_presence(regular);
 assert (select available from public.profiles where id=driver_id),'VIP remains available without signal';
 assert not (select available from public.profiles where id=regular),'Regular driver still expires';
 perform set_config('request.jwt.claim.sub',driver_id::text,true);
 r:=public.driver_presence('heartbeat');
 assert not (r->>'confirmation_due')::boolean,'VIP does not need confirmation';
 update public.profiles set available=false where id=driver_id;
 r:=public.driver_presence('heartbeat');
 assert not (r->>'available')::boolean,'VIP stays manually offline';
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 r:=public.driver_presence('vip_save',jsonb_build_object('driver_id',driver_id,'enabled',false));
 assert not (r->>'enabled')::boolean,'Admin disables VIP';
 assert (select last_activity=now() from private.driver_presence where driver_presence.driver_id=driver_id),'Disabling starts a new grace period';
end $test$;
rollback;
