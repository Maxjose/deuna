"use client";
import {useLayoutEffect,useRef,useState} from 'react';

export function NavIndicator({page}:{page:string}){
 const ref=useRef<HTMLSpanElement>(null);
 const [position,setPosition]=useState<{x:number;y:number}|null>(null);
 useLayoutEffect(()=>{
  const nav=ref.current?.parentElement;if(!nav)return;
  const update=()=>{
   const selected=Array.from(nav.querySelectorAll<HTMLElement>('.nav-item.selected')).find(button=>button.offsetWidth>0);
   if(!selected)return;
   const button=selected.getBoundingClientRect(),parent=nav.getBoundingClientRect();
   setPosition({x:button.left-parent.left-nav.clientLeft+(button.width-28)/2,y:button.top-parent.top-nav.clientTop-8});
  };
  update();const observer=new ResizeObserver(update);observer.observe(nav);
  nav.querySelectorAll('.nav-item').forEach(button=>observer.observe(button));
  return()=>observer.disconnect();
 },[page]);
 return <span ref={ref} className="nav-sliding-indicator" aria-hidden="true" style={{visibility:position?'visible':'hidden',transform:`translate3d(${position?.x||0}px,${position?.y||0}px,0)`}}/>;
}
