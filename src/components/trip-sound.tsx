"use client";

import { useEffect, useRef } from "react";

export function TripSound({userId,trips}:{userId:string;trips:readonly {id:string;passenger_id:string;status:string}[]}) {
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
    const context=audio.current;
    if (!accepted || document.hidden || !context || context.state!=="running") return;
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
