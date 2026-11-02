-- Dispositivos FCM (app nativa) junto a web push. Rollback.
begin;
do $test$
declare u uuid:=gen_random_uuid(); rejected boolean;
begin
  insert into auth.users(id) values(u);
  set local role authenticated; perform set_config('request.jwt.claim.sub',u::text,true);
  assert (public.push_manage('subscribe',jsonb_build_object('endpoint','fcm:'||repeat('a',40)||':APA91b_x-y','keys','{}'::jsonb))->>'enabled')='true','FCM subscribe';
  assert (public.push_manage('info',jsonb_build_object('endpoint','fcm:'||repeat('a',40)||':APA91b_x-y'))->>'enabled')='true','FCM info';
  rejected:=false; begin perform public.push_manage('subscribe',jsonb_build_object('endpoint','fcm:x','keys','{}'::jsonb)); exception when check_violation then rejected:=true; end;
  assert rejected,'Bad FCM token';
  rejected:=false; begin perform public.push_manage('subscribe',jsonb_build_object('endpoint','https://evil.example/x','keys',jsonb_build_object('p256dh',repeat('a',87),'auth',repeat('b',22)))); exception when check_violation then rejected:=true; end;
  assert rejected,'Web endpoint still validated';
  reset role;
  assert (select kind from private.push_devices where user_id=u)='fcm','Kind';
  raise notice 'fcm-devices ok';
end
$test$;
rollback;
