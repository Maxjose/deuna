import test from 'node:test';
import assert from 'node:assert/strict';
import {participantKey,cacheParticipant,readParticipant,clearParticipantCache,subscribeParticipant} from '../src/lib/participant-cache.ts';
test('precarga queda disponible al entrar y comparte solicitudes concurrentes',async()=>{
 const viewer='qa-one',key=participantKey(viewer,'rating','driver');let calls=0;
 const loader=async()=>{calls++;return{average:4.5,count:2};};
 await Promise.all([cacheParticipant(viewer,key,loader),cacheParticipant(viewer,key,loader)]);
 assert.equal(calls,1);assert.deepEqual(readParticipant(key),{average:4.5,count:2});
 await cacheParticipant(viewer,key,loader);assert.equal(calls,1);
 assert.equal(readParticipant(participantKey('other','rating','driver')),null);clearParticipantCache(viewer);
});
test('actualizar conserva el valor anterior y no notifica si los datos no cambiaron',async()=>{
 const viewer='qa-two',key=participantKey(viewer,'trip','trip');let notifications=0;
 await cacheParticipant(viewer,key,async()=>({name:'José',rating:{average:4,count:1}}));
 const previous=readParticipant(key),unsubscribe=subscribeParticipant(key,()=>notifications++);
 await cacheParticipant(viewer,key,async()=>({name:'José',rating:{average:4,count:1}}),Number.MAX_SAFE_INTEGER);
 assert.equal(readParticipant(key),previous);assert.equal(notifications,0);
 await assert.rejects(cacheParticipant(viewer,key,async()=>{throw Error('offline');},Number.MAX_SAFE_INTEGER));assert.equal(readParticipant(key),previous);
 unsubscribe();clearParticipantCache(viewer);
});
test('cerrar sesión limpia datos e impide que una respuesta pendiente repueble la caché',async()=>{
 const viewer='qa-three',key=participantKey(viewer,'rating','person');let resolve;
 const waiting=cacheParticipant(viewer,key,()=>new Promise(done=>{resolve=done;}));
 await Promise.resolve();clearParticipantCache(viewer);resolve({average:5,count:1});await waiting;
 assert.equal(readParticipant(key),null);
});
