import { useEffect } from 'react';

/** Register the shell service worker (PWA offline support). */
export function useServiceWorker(): void {
  useEffect(() => {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
      void navigator.serviceWorker.register('/sw.js');
    }
  }, []);
}
