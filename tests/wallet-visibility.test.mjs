import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=ts.createSourceFile('dashboard.tsx',readFileSync(new URL('../src/components/dashboard.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let expression,menu;
function visit(n){
 if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='walletAvailable')expression=n.initializer;
 if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='filter'&&n.arguments[0]?.getText(source).includes('section!=="wallet"'))menu=n.arguments[0];
 ts.forEachChild(n,visit);
}
visit(source);assert.ok(expression);assert.ok(menu);
const evaluate=(n,context)=>runInNewContext(ts.transpileModule('const result='+n.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';result;',{...context});
test('pago directo oculta saldo; comisión conserva los fondos aunque no se permitan recargas',()=>{
 for(const [settings,expected] of [[null,false],[{billing_mode:'subscription',wallet_topup_enabled:false},false],[{billing_mode:'subscription',wallet_topup_enabled:true},false],[{billing_mode:'commission',wallet_topup_enabled:false},true]]){
  const available=evaluate(expression,{settings,subscription:settings?.billing_mode==='subscription'});
  assert.equal(available,expected);
  const visible=[['info'],['wallet'],['favorites']].filter(evaluate(menu,{walletAvailable:available}));
  assert.equal(visible.some(([key])=>key==='wallet'),expected);assert.equal(visible.length,expected?3:2);
 }
});
