"use client";
import { useCallback, useEffect, useState } from 'react';
import { AppIcon } from './app-icon';
export type AdminTheme = 'light' | 'dark';
export function useAdminTheme(userId:string) {
  const [theme,setTheme]=useState<AdminTheme>('light');
  const key=`de1na:admin-theme:v1:${userId}`;
  useEffect(()=>{
    try { setTheme(localStorage.getItem(key)==='dark'?'dark':'light'); } catch { setTheme('light'); }
    const sync=(event:StorageEvent)=>{if(event.key===key)setTheme(event.newValue==='dark'?'dark':'light');};
    window.addEventListener('storage',sync);
    return()=>window.removeEventListener('storage',sync);
  },[key]);
  const toggleTheme=useCallback(()=>{
    const next=theme==='dark'?'light':'dark';
    setTheme(next);
    try { localStorage.setItem(key,next); } catch { /* Keep the control usable when storage is unavailable. */ }
  },[theme,key]);
  return {theme,toggleTheme};
}
export function AdminThemeToggle({theme,onToggle}:{theme:AdminTheme;onToggle:()=>void}) {
  const label=theme==='dark'?'Activar modo claro':'Activar modo oscuro';
  return <button type="button" className="admin-theme-toggle" onClick={onToggle} aria-label={label} title={label}>
    <AppIcon name={theme==='dark'?'sun':'moon'}/><span>{theme==='dark'?'Modo claro':'Modo oscuro'}</span>
  </button>;
}
