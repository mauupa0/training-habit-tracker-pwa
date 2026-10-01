"use client";

export type NavKey = "today" | "progress" | "plans" | "knowledge";

const LABEL: Record<NavKey, string> = {
  today: "Dziś",
  progress: "Postęp",
  plans: "Plany",
  knowledge: "Wiedza",
};

/**
 * Cztery pozycje z podpisami - same ikony są zgadywanką. Stan aktywny to kreska
 * i kolor tekstu, bez wypełnionego tła i bez kropek powiadomień.
 * Ekran sesji nie pokazuje tego paska: w trakcie treningu nie ma dokąd iść.
 */
export function BottomNav({
  current,
  items,
  onGo,
}: {
  current: NavKey;
  items: NavKey[];
  onGo: (key: NavKey) => void;
}) {
  return (
    <nav className="sy-nav" aria-label="Główne sekcje">
      {items.map((key) => (
        <button
          key={key}
          type="button"
          className="sy-nav__item"
          aria-current={key === current ? "page" : undefined}
          onClick={() => onGo(key)}
        >
          {LABEL[key]}
        </button>
      ))}
    </nav>
  );
}
