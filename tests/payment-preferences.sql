begin;
select set_config('qa.p',gen_random_uuid()::text,true),set_config('qa.other',gen_random_uuid()::text,true),set_config('qa.driver',gen_random_uuid()::text,true);
insert into auth.users(id,email) select current_setting(k)::uuid,'pref-'||current_setting(k)||'@example.invalid' from unnest(array['qa.p','qa.other','qa.driver'])k;
update public.profiles set role='driver',approved=true where id=current_setting('qa.driver')::uuid;
select set_config('request.jwt.claim.sub',current_setting('qa.p'),true);
set local role authenticated;
insert into public.passenger_payment_preferences(user_id,bank,phone) values(auth.uid(),'0102','04121234567');
do $$begin
 if not exists(select 1 from public.passenger_payment_preferences where user_id=auth.uid()) then raise exception 'Own preferences unavailable';end if;
 begin insert into public.passenger_payment_preferences values(current_setting('qa.other')::uuid,'0102','04121234567');raise exception 'Saved for another user';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.other'),true);
do $$begin if exists(select 1 from public.passenger_payment_preferences where user_id=current_setting('qa.p')::uuid) then raise exception 'Other passenger can read preferences';end if;end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.driver'),true);
do $$begin
 if exists(select 1 from public.passenger_payment_preferences) then raise exception 'Driver can read preferences';end if;
 begin insert into public.passenger_payment_preferences values(auth.uid(),'0102','04121234567');raise exception 'Driver saved preferences';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
