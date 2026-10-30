import type {SupabaseClient} from '@supabase/supabase-js';
import {cacheParticipant,participantKey} from './participant-cache';
export type Reputation={average:number|null;count:number};
export type TripContact={name:string;rating:Reputation};
export function loadReputation(client:SupabaseClient,viewer:string,id:string){return cacheParticipant<Reputation>(viewer,participantKey(viewer,'rating',id),async()=>{const{data,error}=await client.rpc('user_reputation',{person_id:id});if(error)throw error;return data;});}
export function loadTripContact(client:SupabaseClient,viewer:string,id:string){return cacheParticipant<TripContact|null>(viewer,participantKey(viewer,'trip',id),async()=>{const{data,error}=await client.rpc('trip_person',{trip_id:id});if(error)throw error;return data;});}
