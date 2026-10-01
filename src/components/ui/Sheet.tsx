"use client";

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet. Wysuwanie 200 ms, zamykany gestem i Escape.
 * Jedyna animacja w aplikacji poza paskiem timera.
 */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const drag = useRef<{ y: number; delta: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      opener.current?.focus();
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  // Ciągnięcie w dół zamyka. Start łapiemy tylko przy górnej krawędzi treści,
  // żeby gest nie kradł przewijania długiego arkusza.
  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((panel.current?.scrollTop ?? 0) > 0) return;
    drag.current = { y: e.clientY, delta: 0 };
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current || !panel.current) return;
    const delta = e.clientY - drag.current.y;
    if (delta <= 0) return;
    drag.current.delta = delta;
    panel.current.style.transition = 'none';
    panel.current.style.transform = `translateY(${delta}px)`;
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!panel.current) return;
    if (d && d.delta > 70) { onClose(); return; }
    // za krótki gest - panel wraca na miejsce tym samym czasem co wysuwanie
    panel.current.style.transition = 'transform var(--dur-sheet) var(--ease)';
    panel.current.style.transform = '';
  }

  return createPortal(
    <div className="dz-sheet">
      <div className="dz-sheet__scrim" onClick={onClose} />
      <div
        className="dz-sheet__panel"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="dz-sheet__head">
          <h2 className="dz-sheet__title">{title}</h2>
          <button type="button" className="dz-sheet__close" aria-label="Zamknij" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export interface SheetOptionProps {
  label: string;
  state?: string;
  /** Stan po prawej w --mark tylko dla akcji nieodwracalnych. */
  danger?: boolean;
  pressed?: boolean;
  onClick: () => void;
}

export function SheetOption({ label, state, danger, pressed, onClick }: SheetOptionProps) {
  return (
    <button
      type="button" className="dz-sheet__option"
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span>{label}</span>
      {state && (
        <span style={{
          flex: 'none', fontSize: 11.5, letterSpacing: '.1em', textTransform: 'uppercase',
          color: danger ? 'var(--mark)' : pressed === false ? 'var(--ink-3)' : 'var(--stamp)',
        }}>{state}</span>
      )}
    </button>
  );
}
