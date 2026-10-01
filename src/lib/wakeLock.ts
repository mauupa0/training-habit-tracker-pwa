"use client";

import { useEffect } from "react";

const SETTING_KEY = "wake_lock_off";

export function wakeLockDisabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SETTING_KEY) === "1";
}

export function setWakeLockDisabled(off: boolean): void {
  window.localStorage.setItem(SETTING_KEY, off ? "1" : "0");
}

/**
 * Ekran nie gaśnie podczas sesji. Blokada pada przy każdym przejściu w tło,
 * więc trzeba ją odzyskiwać po powrocie - bez tego wygasa po pierwszym
 * zablokowaniu telefonu w przerwie między seriami.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || wakeLockDisabled()) return;
    if (!("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // odmowa albo brak wsparcia - sesja ma działać dalej
      }
    };

    const onVisible = () => {
      if (!stopped && document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, [active]);
}

/** Krótkie potwierdzenie zapisu. Bez dźwięku, bez animacji. */
export function buzz(ms = 15): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
}

/** Powiadomienie o końcu przerwy - jedyne dozwolone poza przypomnieniem o sesji. */
export async function askNotifyPermission(): Promise<void> {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      // brak zgody nie blokuje treningu
    }
  }
}

export function notifyRestOver(): void {
  buzz(30);
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification("Przerwa skończona", { body: "Następna seria.", silent: false });
  } catch {
    // Safari na iOS potrafi rzucić poza kontekstem service workera
  }
}
