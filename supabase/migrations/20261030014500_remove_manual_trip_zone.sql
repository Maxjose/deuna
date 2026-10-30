-- Preserve historical zones; new requests use their confirmed map destination.
alter table public.trips alter column zone drop not null;
do $migration$
declare definition text;
begin
  select pg_get_functiondef('private.operate(text,jsonb)'::regprocedure) into definition;
  if position('if not coalesce((payload->>''zone'')=any(s.zones),false)' in definition)=0 then
    raise exception 'Unexpected request function; review migration';
  end if;
  definition := replace(definition,
    'if not coalesce((payload->>''zone'')=any(s.zones),false) then raise exception ''Fuera de cobertura'';end if;',
    '-- Destination is confirmed on the map; no manual zone required.');
  definition := replace(definition,
    'trim(payload->>''destination''),payload->>''zone'')',
    'trim(payload->>''destination''),null)');
  execute definition;
end;
$migration$;
