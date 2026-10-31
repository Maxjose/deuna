-- Terminología: "conductor" en lugar de "motorizado" en los textos que generan las funciones
-- (notificaciones, chat, cancelaciones, valoraciones, administración y pagos), para admitir
-- en el futuro vehículos que no sean motos. Solo cambian textos; la lógica no se modifica.
do $$
declare f regprocedure; def text;
begin
 for f in
  select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.prokind = 'f'
   and p.proname in ('admin_records', 'driver_cancel', 'queue_trip_push', 'report_payment', 'trip_chat', 'trip_feedback', 'trip_person')
 loop
  def := pg_get_functiondef(f);
  if def ilike '%motorizad%' then
   def := replace(replace(replace(replace(def, 'Motorizados', 'Conductores'), 'motorizados', 'conductores'), 'Motorizado', 'Conductor'), 'motorizado', 'conductor');
   execute def;
  end if;
 end loop;
end $$;
