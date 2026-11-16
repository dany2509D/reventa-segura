'use client';

import { useEffect } from 'react';

// Registers the (private-by-default) service worker in production only: in development a cached
// worker would hide code changes.
export default function RegisterSw() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Installability is a nicety; the app works without the worker.
    });
  }, []);
  return null;
}
