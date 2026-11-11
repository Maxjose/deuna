'use client';
import { useEffect } from 'react';
export default function Home() {
  // Let InstallGate inspect recovery fragments before entering protected routes.
  useEffect(() => { window.location.replace('/dashboard'); }, []);
  return <p role="status">Preparando De1na…</p>;
}
