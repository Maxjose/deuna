import {cp,mkdir} from 'node:fs/promises';
const target=new URL('../public/pdfjs/',import.meta.url);
await mkdir(target,{recursive:true});
const source=new URL('../node_modules/pdfjs-dist/',import.meta.url);
await cp(new URL('build/pdf.worker.min.mjs',source),new URL('pdf.worker.min.mjs',target));
for(const folder of ['cmaps','standard_fonts','wasm'])await cp(new URL(folder,source),new URL(folder,target),{recursive:true});
