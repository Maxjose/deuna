import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {parseStoredPlace} from '../src/lib/journey.ts';
import {etaMinutes} from '../src/lib/live-location.ts';

function load(path, imports) {
 const exports={};
 const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 runInNewContext(code,{exports,require:name=>{if(!(name in imports))throw Error(name);return imports[name];},URL,Response,Date});
 return exports;
}
const {tripLiveSummary}=load('../src/lib/trip-live.ts',{'./journey':{parseStoredPlace},'./live-location':{etaMinutes}});
const trip={status:'assigned',origin:'Recogida · (11.08000, -71.60000)',destination:'Destino · (11.10000, -71.62000)'};
const now=Date.now(),location={latitude:11.081,longitude:-71.601,accuracy:10,recorded_at:new Date(now).toISOString()};
test('seguimiento cambia de recogida a destino y solo usa GPS reciente y preciso',()=>{
 const pickup=tripLiveSummary(trip,location,now);
 assert.match(pickup.title,/en camino/);assert.ok(pickup.eta>0);
 assert.ok(tripLiveSummary({...trip,status:'ongoing'},location,now).eta>pickup.eta);
 assert.equal(tripLiveSummary({...trip,status:'arrived'},location,now).eta,null);
 for(const fix of [null,{...location,accuracy:500},{...location,recorded_at:new Date(now-60000).toISOString()},{...location,latitude:NaN}])
   assert.equal(tripLiveSummary(trip,fix,now).eta,null);
});

function api({user={id:'passenger'},result=trip,error=null}={}) {
 const filters=[];
 const query={select(){return this;},eq(key,value){filters.push([key,value]);return this;},async maybeSingle(){return {data:result,error};}};
 const client={auth:{getUser:async()=>({data:{user},error:null})},from:()=>query};
 const {GET}=load('../src/app/api/trip-live/route.ts',{'@/lib/supabase/server':{serverClient:async()=>client},'@/lib/trip-live':{tripLiveSummary}});
 return {get:id=>GET(new Request('http://localhost/api/trip-live?id='+id)),filters};
}
const id='12345678-1234-1234-1234-123456789012';
test('conductor ve recogida, espera y destino con su propio filtro de autorización',async()=>{
 assert.equal(tripLiveSummary(trip,location,now,true).title,'Recoger al pasajero');
 assert.equal(tripLiveSummary({...trip,status:'arrived'},location,now,true).title,'En la recogida');
 assert.equal(tripLiveSummary({...trip,status:'ongoing'},location,now,true).title,'Llevar al pasajero');
 const driver=api({result:{status:'finished'}});
 assert.equal((await driver.get(id+'&viewer=driver')).status,200);
 assert.ok(driver.filters.some(([key,value])=>key==='driver_id'&&value==='passenger'));
 assert.ok(!driver.filters.some(([key])=>key==='passenger_id'));
 assert.equal((await api({result:null}).get(id+'&viewer=driver')).status,404);
});
test('endpoint exige sesión y propiedad del pasajero, sin exponer direcciones',async()=>{
 assert.equal((await api({user:null}).get(id)).status,401);
 assert.equal((await api({result:null}).get(id)).status,404);
 assert.equal((await api().get('invalid')).status,400);
 const endpoint=api({result:{status:'finished'}});
 const response=await endpoint.get(id);
 assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(await response.json(),{status:'finished'});
 assert.ok(endpoint.filters.some(([key,value])=>key==='passenger_id'&&value==='passenger'));
});
test('un error de base no se interpreta como finalización de viaje',async()=>{
 assert.equal((await api({error:{message:'offline'}}).get(id)).status,503);
});
