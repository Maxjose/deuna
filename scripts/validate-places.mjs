import fs from 'node:fs';
import { validateCatalogDocument } from '../src/lib/catalog.ts';
const file=process.argv[2];
if(!file){console.error('Uso: npm run catalog:validate -- archivo.json');process.exit(1);}
try{
  if(fs.statSync(file).size>5*1024*1024)throw Error('El archivo supera 5 MB.');
  const result=validateCatalogDocument(JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')));
  for(const error of result.errors)console.error(error);
  for(const warning of result.warnings)console.warn(warning);
  if(result.errors.length)process.exitCode=1;
  else console.log(`${result.places.length} lugares válidos. ${result.warnings.length} advertencias.`);
}catch(error){console.error(error instanceof Error?error.message:'No se pudo validar el archivo.');process.exitCode=1;}
