import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
function callback(error=null){
 const exports={};
 const source=ts.transpileModule(readFileSync(new URL('../src/app/auth/callback/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 runInNewContext(source,{exports,URL,require:name=>name==='next/server'?{NextResponse:{redirect:url=>({url,headers:new Headers()})}}:{serverClient:async()=>({auth:{exchangeCodeForSession:async()=>({error})}})}});
 return url=>exports.GET({nextUrl:new URL(url),url,headers:new Headers({'user-agent':'Android'})});
}
test('confirmación Android: termina en página pública y nunca intenta abrir la app',async()=>{
 const result=await callback()('https://www.de1na.app/auth/callback?code=test');
 assert.equal(result.url.pathname,'/auth/confirmation');
 assert.equal(result.headers.get('Cache-Control'),'private, no-store');
 const otherBrowser=await callback({code:'bad_code_verifier'})('https://www.de1na.app/auth/callback?code=test');
 assert.equal(otherBrowser.url.pathname,'/auth/confirmation');
});
test('recuperación conserva su formulario; enlaces vacíos muestran ayuda',async()=>{
 const reset=await callback()('https://www.de1na.app/auth/callback?code=test&next=/reset-password&complete=1');
 assert.equal(reset.url.pathname,'/reset-password');
 assert.equal(reset.url.searchParams.get('session'),'1');
 const invalid=await callback()('https://www.de1na.app/auth/callback');
 assert.equal(invalid.url.pathname,'/auth/confirmation');
 assert.equal(invalid.url.searchParams.get('error'),'invalid_link');
 const gate=readFileSync(new URL('../src/components/install-gate.tsx',import.meta.url),'utf8');
 assert.ok(gate.includes("'/auth/confirmation'"));
});

test('recuperación Android nunca exige abrir o instalar la aplicación',async()=>{
 const implicit=await callback()('https://www.de1na.app/auth/callback?next=/reset-password');
 assert.equal(implicit.url.pathname,'/reset-password');
 assert.equal(implicit.url.hash,'');
 assert.equal(implicit.url.search,'');
 const legacy=await callback()('https://www.de1na.app/auth/callback?code=test&next=/reset-password');
 assert.equal(legacy.url.pathname,'/reset-password');
 const invalid=await callback({code:'bad_code_verifier'})('https://www.de1na.app/auth/callback?code=test&next=/reset-password');
 assert.equal(invalid.url.pathname,'/reset-password');
 assert.equal(invalid.url.searchParams.get('error'),'invalid_link');
 const expired=await callback()('https://www.de1na.app/auth/callback?next=/reset-password&error=access_denied');
 assert.equal(expired.url.pathname,'/reset-password');
 assert.equal(expired.url.searchParams.get('error'),'invalid_link');
});
