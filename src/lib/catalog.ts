export type CatalogPlace = {
  source: string; external_id: string; name: string; latitude: number; longitude: number;
  aliases: string[]; address: string; municipality: string; category: string; reference: string;
  source_url: string; active?: boolean;
};
export type CatalogRecord = CatalogPlace & { id: string; active: boolean; updated_at: string };
export type CatalogValidation = { places: CatalogPlace[]; errors: string[]; warnings: string[] };
const allowed = new Set(['source','external_id','name','latitude','longitude','aliases','address','municipality','category','reference','source_url','active']);
export function normalizeCatalogText(text: string) { return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim(); }
export function validateCatalogDocument(value: unknown): CatalogValidation {
  const errors: string[] = [], warnings: string[] = [], places: CatalogPlace[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { places, errors:['El archivo debe ser un objeto con version: 1 y places: [...].'], warnings };
  const document = value as Record<string, unknown>;
  if (document.version !== 1 || !Array.isArray(document.places) || !document.places.length || document.places.length > 1000)
    return { places, errors:['Usa version: 1 y entre 1 y 1.000 elementos en places.'], warnings };
  if(Object.keys(document).some(key=>!['version','places'].includes(key))) errors.push('El documento solo admite version y places.');
  const identities = new Set<string>();
  document.places.forEach((item: unknown, index: number) => {
    const prefix = `Lugar ${index+1}: `;
    if(!item || typeof item!=='object' || Array.isArray(item)){errors.push(prefix+'debe ser un objeto.');return;}
    const row=item as Record<string,unknown>; const before=errors.length;
    for(const key of Object.keys(row))if(!allowed.has(key))errors.push(prefix+`campo desconocido «${key}».`);
    const text=(key:string,max:number,required=false)=>{
      const value=row[key];
      if(value===undefined && !required)return '';
      if(typeof value!=='string'){errors.push(prefix+`${key} debe ser texto.`);return '';}
      const trimmed=value.trim();
      if(trimmed.length>max || (required&&!trimmed))errors.push(prefix+`${key} debe tener ${required?'entre 1 y ':'hasta '}${max} caracteres.`);
      return trimmed;
    };
    const source=text('source',40,true),external_id=text('external_id',160,true),name=text('name',110,true);
    if(!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(source))errors.push(prefix+'source solo admite minúsculas, números, guiones y guiones bajos.');
    const latitude=row.latitude,longitude=row.longitude;
    if(typeof latitude!=='number'||!Number.isFinite(latitude)||Math.abs(latitude)>90)errors.push(prefix+'latitude debe ser un número entre -90 y 90.');
    if(typeof longitude!=='number'||!Number.isFinite(longitude)||Math.abs(longitude)>180)errors.push(prefix+'longitude debe ser un número entre -180 y 180.');
    if(typeof latitude==='number'&&typeof longitude==='number'&&(latitude<8.3||latitude>12.6||longitude< -73.5||longitude> -70.5))warnings.push(prefix+'el punto está fuera del entorno de búsqueda del Zulia; no aparecerá en las búsquedas actuales.');
    let aliases:string[]=[];
    if(row.aliases!==undefined){
      if(!Array.isArray(row.aliases)||row.aliases.length>10||row.aliases.some(v=>typeof v!=='string'||!v.trim()||v.trim().length>80)) errors.push(prefix+'aliases debe ser una lista de hasta 10 textos de 1 a 80 caracteres.');
      else aliases=[...new Set(row.aliases.map(v=>(v as string).trim()))];
    }
    if(row.active!==undefined&&typeof row.active!=='boolean')errors.push(prefix+'active debe ser true o false.');
    const address=text('address',200),municipality=text('municipality',100),category=text('category',60),reference=text('reference',240),source_url=text('source_url',2048);
    if(source_url){try{const url=new URL(source_url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error();}catch{errors.push(prefix+'source_url debe ser una URL http o https válida.');}}
    const identity=JSON.stringify([source,external_id]);
    if(identities.has(identity))errors.push(prefix+'source + external_id está repetido en este archivo.');
    identities.add(identity);
    if(errors.length===before)places.push({source,external_id,name,latitude:latitude as number,longitude:longitude as number,aliases,address,municipality,category,reference,source_url,...(typeof row.active==='boolean'?{active:row.active}:{})});
  });
  return {places,errors,warnings};
}
export function catalogPlaceLabel(place: {name:string;address?:string;municipality?:string}) {
  return [place.name,place.address,place.municipality].filter(Boolean).join(', ').slice(0,110);
}
export function decodeCatalogPlaces(body: unknown) {
  if(!Array.isArray(body))return [];
  return body.slice(0,8).flatMap(row=>{
    if(!row||typeof row!=='object'||typeof row.name!=='string'||!row.name.trim()||typeof row.latitude!=='number'||typeof row.longitude!=='number'||!Number.isFinite(row.latitude)||!Number.isFinite(row.longitude)||Math.abs(row.latitude)>90||Math.abs(row.longitude)>180)return [];
    return [{label:catalogPlaceLabel({name:row.name,address:typeof row.address==='string'?row.address:'',municipality:typeof row.municipality==='string'?row.municipality:''}),point:{lat:row.latitude,lng:row.longitude}}];
  });
}
