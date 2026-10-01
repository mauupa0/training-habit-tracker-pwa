"use client";

import { useEffect } from "react";

/**
 * W trybie deweloperskim celowo nie rejestrujemy workera - serwowałby
 * nieaktualne bundle po każdym przeładowaniu. Offline testujemy na buildzie.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // brak workera oznacza tylko brak powłoki offline - aplikacja działa dalej
    });
  }, []);

  return null;
}
