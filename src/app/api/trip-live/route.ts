import { serverClient } from '@/lib/supabase/server';
import { tripLiveSummary } from '@/lib/trip-live';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request) {
  const id=new URL(request.url).searchParams.get('id');
  if(!id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return Response.json({}, {status:400,headers});
  const client=await serverClient();
  const {data:{user},error:authError}=await client.auth.getUser();
  if(authError||!user)return Response.json({}, {status:401,headers});
  const driver=new URL(request.url).searchParams.get('viewer')==='driver';
  const {data:trip,error}=await client.from('trips').select('status,origin,destination').eq('id',id).eq(driver?'driver_id':'passenger_id',user.id).maybeSingle();
  if(error)return Response.json({}, {status:503,headers});
  if(!trip)return Response.json({}, {status:404,headers});
  if(!['assigned','arrived','ongoing'].includes(trip.status))return Response.json({status:trip.status},{headers});
  const {data:location}=await client.from('trip_locations').select('latitude,longitude,accuracy,recorded_at').eq('trip_id',id).maybeSingle();
  return Response.json(tripLiveSummary(trip,location,Date.now(),driver),{headers});
}
