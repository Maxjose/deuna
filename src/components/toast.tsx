"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {noticeKind,type NoticeKind} from '@/lib/notice-kind';

export function useNotice(scope: string) {
  // Each visit has its own identity, including when an old request finishes later.
  const context = useMemo(() => ({ scope }), [scope]);
  const active = useRef(context);
  active.current = context;
  const [notice, setNotice] = useState<{ context: object; text: string } | null>(null);
  const notify = useCallback((text: string) => {
    if (active.current !== context) return;
    if (text) setNotice({ context, text });
    else setNotice(current => current?.context === context ? null : current);
  }, [context]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(current => current === notice ? null : current), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  return { message: notice?.context === context ? notice.text : "", notify };
}

export function Toast({ message,kind }: { message: string;kind?:NoticeKind }) {
  return message ? <ToastMessage key={message} message={message} kind={kind||noticeKind(message)}/> : null;
}
function ToastMessage({message,kind}:{message:string;kind:NoticeKind}){
 const [closing,setClosing]=useState(false),[hidden,setHidden]=useState(false),[offset,setOffset]=useState(0);
 const start=useRef<{x:number;y:number}|null>(null);
 useEffect(()=>{if(!closing)return;const timer=setTimeout(()=>setHidden(true),220);return()=>clearTimeout(timer);},[closing]);
 if(hidden)return null;
 const paths={success:'m5 12 4 4L19 6',warning:'M12 3 2 21h20ZM12 9v5M12 17h.01',error:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9 9l6 6M15 9l-6 6',info:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v6M12 7h.01'};
 return <div className={'app-toast toast-'+kind+(closing?' toast-closing':'')} role="status" aria-live="polite" tabIndex={0} aria-label={message+' Desliza hacia arriba o pulsa Escape para descartar.'}
  style={{transform:`translate(-50%, ${closing?'-140%':`${offset}px`})`}}
  onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setClosing(true);}}}
  onPointerDown={e=>{start.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}}
  onPointerMove={e=>{if(start.current)setOffset(Math.max(-100,Math.min(0,e.clientY-start.current.y)));}}
  onPointerCancel={()=>{start.current=null;setOffset(0);}}
  onPointerUp={e=>{const point=start.current;start.current=null;if(point&&e.clientY-point.y<-35&&Math.abs(e.clientY-point.y)>Math.abs(e.clientX-point.x))setClosing(true);else setOffset(0);}}>
   <span className="toast-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]}/></svg></span>
   <span className="toast-text">{message}</span>
 </div>;
}
