"use client";

import { useEffect, useState } from "react";
import { getSyncStatus, retryBlocked, subscribeSync, type SyncStatus } from "@/lib/db/sync";

/**
 * Kropka w rogu: pełna = zsynchronizowane, pusta = coś czeka w kolejce.
 * Bez tekstu, bez animacji, bez modala - synchronizacja nigdy nie przerywa pracy.
 *
 * Wersja z handoffu przyjmuje gotowe `synced`. Tutaj kropka sama słucha silnika,
 * a zablokowaną kolejkę można wznowić tapnięciem.
 */
export function SyncDot() {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    let alive = true;
    void getSyncStatus().then((s) => alive && setStatus(s));
    const off = subscribeSync((s) => alive && setStatus(s));
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!status) return null;

  const waiting = status.pending + status.blocked > 0;
  const label = waiting
    ? `Do wysłania: ${status.pending + status.blocked}. Dane są zapisane w telefonie.`
    : "Zsynchronizowane";

  return (
    <button
      type="button"
      onClick={() => {
        if (status.blocked > 0) void retryBlocked();
      }}
      aria-label={label}
      title={label}
      style={{
        width: "var(--tap-min)",
        height: "var(--tap-min)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        margin: -9,
        background: "none",
        border: 0,
        padding: 0,
        cursor: status.blocked > 0 ? "pointer" : "default",
      }}
    >
      <span className={waiting ? "dz-sync dz-sync--queued" : "dz-sync"} aria-hidden="true" />
    </button>
  );
}
