import test from 'node:test';
import assert from 'node:assert/strict';
import {supportRoute,supportHash} from '../src/lib/support-navigation.ts';
import {writeAppHash} from '../src/lib/app-navigation.ts';
const id='12345678-1234-1234-1234-123456789abc';
test('soporte: ayuda, conversaciones y chat conservan su propia ruta',()=>{
 assert.deepEqual(supportRoute('#account/support'),{view:'help',id:''});
 assert.deepEqual(supportRoute('#account/support/inbox'),{view:'inbox',id:''});
 assert.deepEqual(supportRoute(supportHash('chat',id)),{view:'chat',id});
 assert.equal(supportHash('chat','invalid'),'account/support/inbox');
 assert.equal(supportRoute('#account/support/chat/invalid').view,'inbox');
});
test('soporte: navegar conserva el historial de Next y permite volver por cada pantalla',()=>{
 const history=[];
 const target={location:{hash:'#account/support'},history:{state:{__NA:true},pushState(state,_,hash){history.push({state,hash});target.location.hash=hash;}}};
 writeAppHash(target,supportHash('inbox'));
 writeAppHash(target,supportHash('chat',id));
 assert.equal(supportRoute(history[0].hash).view,'inbox');
 assert.equal(supportRoute(history[1].hash).id,id);
 assert.ok(history.every(x=>x.state.__NA));
});
