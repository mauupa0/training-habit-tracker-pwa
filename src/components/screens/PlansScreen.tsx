"use client";

import { useEffect, useState } from "react";
import { SourceChip } from "@/components/ui/SourceChip";
import { ifThenPlans, latestWoop } from "@/lib/db/queries";
import { saveIfThenPlan } from "@/lib/db/repo";
import { WoopWizard } from "./HabitsOnboarding";
import type { LocalIfThenPlan, LocalWoopEntry } from "@/types";

function sentence(plan: LocalIfThenPlan): string {
  return `${plan.trigger_pl}, to ${plan.action_pl}`;
}

/** Plany jeśli-to i aktualny WOOP. Porażka nad startem - mocniejszy efekt. */
export function PlansScreen() {
  const [plans, setPlans] = useState<LocalIfThenPlan[]>([]);
  const [woop, setWoop] = useState<LocalWoopEntry | undefined>();
  const [editing, setEditing] = useState<LocalIfThenPlan | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState<"start" | "failure" | null>(null);
  const [woopWizard, setWoopWizard] = useState(false);

  const refresh = async () => {
    setPlans(await ifThenPlans());
    setWoop(await latestWoop());
  };

  useEffect(() => {
    void refresh();
  }, []);

  async function save(type: "start" | "failure", id?: string) {
    const marker = draft.toLowerCase().indexOf(", to ");
    const trigger_pl = marker === -1 ? draft.trim() : draft.slice(0, marker).trim();
    const action_pl = marker === -1 ? draft.trim() : draft.slice(marker + 5).trim();
    await saveIfThenPlan({ id, type, trigger_pl, action_pl });
    setDraft("");
    setEditing(null);
    setAdding(null);
    await refresh();
  }

  if (woopWizard) {
    return (
      <WoopWizard
        onDone={() => {
          setWoopWizard(false);
          void refresh();
        }}
      />
    );
  }

  const groups: Array<{ type: "failure" | "start"; title: string }> = [
    { type: "failure", title: "Na porażkę" },
    { type: "start", title: "Na start" },
  ];

  return (
    <main className="sy-screen sy-with-nav">
      <header className="sy-head">
        <h1 className="sy-title">Plany</h1>
      </header>

      {groups.map((group) => (
        <section key={group.type} className="sy-section">
          <h2 className="sy-section__title">
            {group.title}
            <SourceChip sourceKey="gollwitzer2006" />
          </h2>

          <ul className="sy-list">
            {plans
              .filter((p) => p.type === group.type)
              .map((p) => (
                <li key={p.id} className="sy-list__row" style={{ alignItems: "flex-start" }}>
                  {editing?.id === p.id ? (
                    <span style={{ width: "100%" }}>
                      <textarea
                        className="sy-input"
                        rows={3}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                      <div className="flex gap-2.5">
                        <button
                          type="button"
                          className="sy-btn sy-btn--ghost"
                          onClick={() => void save(p.type, p.id)}
                        >
                          Zapisz
                        </button>
                        <button
                          type="button"
                          className="sy-btn sy-btn--ghost"
                          onClick={() => setEditing(null)}
                        >
                          Anuluj
                        </button>
                      </div>
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="sy-choice"
                        style={{ borderTop: 0, opacity: p.active ? 1 : 0.55 }}
                        onClick={() => {
                          setEditing(p);
                          setDraft(sentence(p));
                        }}
                      >
                        <span>{sentence(p)}</span>
                      </button>
                      <button
                        type="button"
                        className="sy-list__meta"
                        style={{ background: "none", border: 0, cursor: "pointer", minHeight: 44 }}
                        onClick={async () => {
                          await saveIfThenPlan({
                            id: p.id,
                            type: p.type,
                            trigger_pl: p.trigger_pl,
                            action_pl: p.action_pl,
                            active: !p.active,
                          });
                          await refresh();
                        }}
                      >
                        {p.active ? "wyłącz" : "włącz"}
                      </button>
                    </>
                  )}
                </li>
              ))}
          </ul>

          {adding === group.type ? (
            <>
              <textarea
                className="sy-input"
                rows={3}
                placeholder="Jeśli…, to…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button
                type="button"
                className="sy-btn sy-btn--ghost"
                disabled={!draft.toLowerCase().includes("jeśli")}
                onClick={() => void save(group.type)}
              >
                Zapisz plan
              </button>
            </>
          ) : (
            <button
              type="button"
              className="sy-btn sy-btn--ghost"
              onClick={() => {
                setAdding(group.type);
                setDraft("");
              }}
            >
              Dodaj plan
            </button>
          )}
        </section>
      ))}

      <section className="sy-section">
        <h2 className="sy-section__title">WOOP</h2>
        {woop ? (
          <>
            <p style={{ color: "var(--ink-2)" }}>{woop.wish}</p>
            <p className="sy-last__value" style={{ marginTop: 8 }}>
              Przeszkoda: {woop.obstacle}
            </p>
            <p className="sy-label" style={{ marginTop: 10 }}>
              Przegląd: <span className="num">{woop.review_at}</span>
            </p>
          </>
        ) : (
          <p style={{ color: "var(--ink-2)" }}>Nie ma jeszcze wpisu.</p>
        )}
        <button type="button" className="sy-btn sy-btn--ghost" onClick={() => setWoopWizard(true)}>
          {woop ? "Nowy przegląd" : "Wypełnij WOOP"}
        </button>
      </section>

      <p className="sy-note">
        Pominięcie jednej okazji nie wpłynęło istotnie na formowanie nawyku. Mediana do
        automatyzmu: <span className="num">66 dni</span>, zakres <span className="num">18-254</span>
        <SourceChip sourceKey="lally2010" />
      </p>
    </main>
  );
}
