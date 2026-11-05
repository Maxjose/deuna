import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=ts.createSourceFile('ride-waiting.tsx',readFileSync(new URL('../src/components/ride-waiting.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let effect;
function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect'&&node.arguments[0]?.getText(source).includes('previousStatus'))effect=node.arguments[0];ts.forEachChild(node,visit);}
visit(source);assert.ok(effect);
function fixture(visible=true,supported=true){
 const states=[],starts=[];let status='inactive',check,listener;
 const document={visibilityState:visible?'visible':'hidden',addEventListener:(_e,f)=>{listener=f;},removeEventListener(){}};
 const bridge={startLiveTrip:id=>starts.push(id),liveTripStatus:()=>status};
 const code=ts.transpileModule('const effect='+effect.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const cleanup=runInNewContext(code+';effect();',{assigned:true,tripId:'trip',nativeBridge:()=>supported?bridge:null,isNativeApp:()=>true,requestedTrip:{current:''},setNotificationStatus:s=>states.push(s),document,setInterval:f=>{check=f;return 1;},clearInterval(){}});
 return {starts,states,document,cleanup,check:()=>check?.(),visible:()=>listener?.(),status:s=>{status=s;}};
}
test('pasajero inicia la notificación automáticamente una vez y respeta la detención',()=>{
 const f=fixture();assert.equal(f.starts.length,1);f.check();assert.equal(f.starts.length,1);
 f.status('active');f.check();assert.equal(f.states.at(-1),'active');
 f.status('inactive');f.check();assert.equal(f.starts.length,1);f.cleanup();
});
test('espera a volver al primer plano y reintenta después de desbloquear notificaciones',()=>{
 const f=fixture(false);assert.equal(f.starts.length,0);
 f.document.visibilityState='visible';f.visible();assert.equal(f.starts.length,1);
 f.status('blocked');f.check();assert.equal(f.states.at(-1),'blocked');
 f.status('inactive');f.visible();assert.equal(f.starts.length,2);f.cleanup();
});
test('APK antiguo muestra que necesita actualización',()=>{
 const f=fixture(true,false);assert.equal(f.states.at(-1),'upgrade');assert.equal(f.starts.length,0);
});
test('muestra estados de arranque y error sin reiniciar silenciosamente el servicio',()=>{
 const f=fixture();
 for(const status of ['starting','session_required','trip_unavailable','offline','start_failed']){
  f.status(status);f.check();assert.equal(f.states.at(-1),status);
 }
 assert.equal(f.starts.length,1);f.cleanup();
});
