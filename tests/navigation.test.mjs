import test from 'node:test';
import assert from 'node:assert/strict';
import {usableFix,refreshNavigationRoute} from '../src/lib/navigation.ts';
test('navegación descarta posiciones antiguas, imprecisas o inválidas',()=>{
 const now=100000,fix={lat:11,lng:-71,accuracy:15,timestamp:now};
 assert.equal(usableFix(fix,now),true);
 for(const change of [{accuracy:1501},{timestamp:now-31000},{timestamp:now+6000},{lat:91},{lng:Infinity},{accuracy:NaN}])assert.equal(usableFix({...fix,...change},now),false);
});
test('ruta se recalcula al moverse y limita peticiones a una cada 30 segundos',()=>{
 const start={lat:11,lng:-71},previous={point:start,at:1000},moved={lat:11.001,lng:-71};
 assert.equal(refreshNavigationRoute(null,start,1000),true);
 assert.equal(refreshNavigationRoute(previous,moved,2000),false);
 assert.equal(refreshNavigationRoute(previous,start,31000),false);
 assert.equal(refreshNavigationRoute(previous,{lat:11.0001,lng:-71},31000),false);
 assert.equal(refreshNavigationRoute(previous,moved,31000),true);
});
