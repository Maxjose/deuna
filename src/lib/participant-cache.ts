type Entry={value:unknown;expires:number;viewer:string};
const entries=new Map<string,Entry>(),pending=new Map<string,Promise<unknown>>(),listeners=new Map<string,Set<()=>void>>(),generations=new Map<string,number>();
export const participantKey=(viewer:string,kind:string,id:string)=>JSON.stringify([viewer,kind,id]);
export function readParticipant<T>(key:string):T|null{return (entries.get(key)?.value as T)??null;}
export function subscribeParticipant(key:string,listener:()=>void){const group=listeners.get(key)||new Set();group.add(listener);listeners.set(key,group);return()=>{group.delete(listener);if(!group.size)listeners.delete(key);};}
export async function cacheParticipant<T>(viewer:string,key:string,loader:()=>Promise<T>,now=Date.now()):Promise<T>{
 const cached=entries.get(key);if(cached&&cached.expires>now)return cached.value as T;
 const running=pending.get(key);if(running)return running as Promise<T>;
 const generation=generations.get(viewer)||0;
 const request=Promise.resolve().then(loader).then(value=>{
  if((generations.get(viewer)||0)!==generation)return value;
  const previous=entries.get(key),same=previous&&JSON.stringify(previous.value)===JSON.stringify(value);
  entries.set(key,{value:same?previous.value:value,expires:Date.now()+30000,viewer});
  if(entries.size>512)entries.delete(entries.keys().next().value!);
  if(!same)listeners.get(key)?.forEach(listener=>listener());return value;
 }).finally(()=>{if(pending.get(key)===request)pending.delete(key);});
 pending.set(key,request);return request;
}
export function clearParticipantCache(viewer:string){
 generations.set(viewer,(generations.get(viewer)||0)+1);
 for(const [key,entry]of entries)if(entry.viewer===viewer){entries.delete(key);listeners.get(key)?.forEach(listener=>listener());}
 for(const key of pending.keys())if(JSON.parse(key)[0]===viewer)pending.delete(key);
}
