-- Notificaciones de la app Android nativa por Firebase Cloud Messaging (FCM).
-- Los dispositivos FCM se guardan junto a los de web push con endpoint 'fcm:<token>' y sin claves de cifrado.
alter table private.push_devices add column kind text not null default 'web' check (kind in ('web', 'fcm'));
alter table private.push_devices drop constraint push_devices_endpoint_check;
alter table private.push_devices drop constraint push_devices_p256dh_check;
alter table private.push_devices drop constraint push_devices_auth_check;
alter table private.push_devices alter column p256dh drop not null, alter column auth drop not null;
alter table private.push_devices add constraint push_devices_target_check check (
 (kind = 'web' and length(endpoint) <= 2048
   and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com)/[^[:space:]]+$'
   and p256dh ~ '^[A-Za-z0-9_-]{87}$' and auth ~ '^[A-Za-z0-9_-]{22}$')
 or (kind = 'fcm' and length(endpoint) <= 4100 and endpoint ~ '^fcm:[A-Za-z0-9_:-]{20,}$' and p256dh is null and auth is null));

do $$declare definition text; patched text;begin
 select pg_get_functiondef('private.push_manage(text,jsonb)'::regprocedure) into definition;
 patched := replace(definition,
  'insert into private.push_devices(user_id,endpoint,p256dh,auth,promotions)' || chr(10) || '     values(uid,payload->>''endpoint'',payload->''keys''->>''p256dh'',payload->''keys''->>''auth'',false)',
  'insert into private.push_devices(user_id,endpoint,p256dh,auth,promotions,kind)' || chr(10) ||
  '     values(uid,payload->>''endpoint'',case when payload->>''endpoint'' like ''fcm:%'' then null else payload->''keys''->>''p256dh'' end,' ||
  'case when payload->>''endpoint'' like ''fcm:%'' then null else payload->''keys''->>''auth'' end,false,case when payload->>''endpoint'' like ''fcm:%'' then ''fcm'' else ''web'' end)');
 if patched = definition then raise exception 'Missing subscribe insert'; end if;
 execute patched;
end $$;
