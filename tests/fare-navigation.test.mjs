import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const source=ts.createSourceFile('ride-request.tsx',readFileSync(new URL('../src/components/ride-request.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let ready,button;
function visit(node){
 if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='fareReady')ready=node.initializer;
 if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(source)==='button'&&node.children.some(child=>ts.isJsxText(child)&&child.text.trim()==='Elegir Moto'))button=node;
 ts.forEachChild(node,visit);
}
visit(source);
function evaluate(node,context){
 const js=ts.transpileModule('const value = '+node.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return runInNewContext(js+';value;',{...context});
}
test('no permite elegir transporte sin ruta, precio vigente o selección de moto',()=>{
 for(const [routeReady,quote,expired,moto,allowed] of [
  [false,null,false,true,false],[true,null,false,true,false],
  [false,{},false,true,false],[true,{},true,true,false],
  [true,{},false,false,false],[true,{},false,true,true],
 ]){
  let step='choose';
  const context={routeReady,quote,expired,moto,setStep:value=>{step=value;}};
  context.fareReady=evaluate(ready,context);
  const attrs=button.openingElement.attributes.properties;
  const disabled=attrs.find(a=>a.name?.text==='disabled').initializer.expression;
  const click=attrs.find(a=>a.name?.text==='onClick').initializer.expression;
  assert.equal(evaluate(disabled,context),!allowed);
  evaluate(click,context)();
  assert.equal(step,allowed?'payment':'choose');
 }
});
