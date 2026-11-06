import test from 'node:test';
import assert from 'node:assert/strict';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';

function fixture(){
 const stream='0 0 0 rg 10 10 80 80 re f';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources <<>> /Contents 5 0 R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources <<>> /Contents 5 0 R >>',
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let pdf='%PDF-1.4\n';const offsets=[0];
 objects.forEach((object,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});
 const xref=pdf.length;pdf+=`xref\n0 6\n0000000000 65535 f \n`;
 for(const offset of offsets.slice(1))pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`;
 pdf+=`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new TextEncoder().encode(pdf);
}
test('visor PDF: abre y dibuja todas las páginas sin depender del visor del navegador',async()=>{
 const task=getDocument({data:fixture()});
 try{
  const pdf=await task.promise;assert.equal(pdf.numPages,2);
  for(let n=1;n<=2;n++){
   const page=await pdf.getPage(n),canvas=createCanvas(200,200);
   await page.render({canvas,viewport:page.getViewport({scale:1})}).promise;
   const pixels=canvas.getContext('2d');
   assert.equal(pixels.getImageData(30,150,1,1).data[0],0);
   assert.equal(pixels.getImageData(150,30,1,1).data[0],255);
  }
 }finally{await task.destroy();}
});
