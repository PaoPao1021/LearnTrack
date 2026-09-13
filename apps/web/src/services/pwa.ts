import { useEffect } from 'react';

/** Register the shell service worker (PWA offline support). */
export function useServiceWorker(): void {
  useEffect(() => {
    const secureContext = window.location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if ('serviceWorker' in navigator && secureContext) {
      void navigator.serviceWorker.register('/sw.js');
    }
  }, []);
}
