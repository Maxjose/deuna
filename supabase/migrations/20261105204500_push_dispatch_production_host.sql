-- Use the canonical production host directly; pg_net must not rely on redirects.
update private.push_config set dispatch_url='https://www.de1na.app/api/push/dispatch' where id=1;
