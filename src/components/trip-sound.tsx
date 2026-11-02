"use client";

import { useEffect, useRef } from "react";
import { readPref } from "@/lib/prefs";

export function TripSound({userId,trips,driver=false}:{userId:string;trips:readonly {id:string;passenger_id:string;status:string}[];driver?:boolean}) {
  const seenRequests = useRef<Set<string>|null>(null);
  const audio = useRef<AudioContext | null>(null);
  const previous = useRef(new Map<string,string>());
  useEffect(() => {
    function unlock() {
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume().catch(()=>{});
      } catch { /* Audio is optional on unsupported devices. */ }
    }
    document.addEventListener("pointerdown",unlock,true);
    return () => {
      document.removeEventListener("pointerdown",unlock,true);
      void audio.current?.close().catch(()=>{});
      audio.current=null;
    };
  },[]);
  useEffect(() => {
    const own=trips.filter(trip=>trip.passenger_id===userId);
    const accepted=own.some(trip=>previous.current.get(trip.id)==="searching" && ["assigned","arrived","ongoing"].includes(trip.status));
    previous.current=new Map(own.map(trip=>[trip.id,trip.status]));
    // Conductor: suena cuando aparece una solicitud nueva (no en la primera carga).
    const searching=trips.filter(trip=>trip.status==="searching"&&trip.passenger_id!==userId).map(trip=>trip.id);
    const newRequest=driver&&seenRequests.current!==null&&searching.some(id=>!seenRequests.current!.has(id));
    seenRequests.current=new Set(searching);
    const context=audio.current;
    if ((!accepted && !newRequest) || document.hidden || !context || context.state!=="running" || !readPref("sound")) return;
    const start=context.currentTime;
    [880,1174.66].forEach((frequency,index)=>{
      const oscillator=context.createOscillator(),gain=context.createGain();
      const at=start+index*0.12;
      oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(0,at);
      gain.gain.linearRampToValueAtTime(0.14,at+0.008);
      gain.gain.exponentialRampToValueAtTime(0.001,at+0.7);
      oscillator.connect(gain);gain.connect(context.destination);
      oscillator.start(at);oscillator.stop(at+0.75);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    });
  },[trips,userId]);
  return null;
}
