"use client";

import { useCallback, useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { SourceChip } from "@/components/ui/SourceChip";
import { todayIso } from "@/lib/day";
import { dailyLogsSince } from "@/lib/db/queries";
import { saveDailyLog } from "@/lib/db/repo";
import type { LocalDailyLog } from "@/types";

/**
 * Kreatyna. Najprostszy moduł w aplikacji: jedno pytanie, jedna odpowiedź.
 * Bez fazy ładowania i bez rozróżniania dni treningowych - liczy się codzienność.
 */
export function CreatineModule() {
  const [logs, setLogs] = useState<LocalDailyLog[]>([]);
  const [knowledge, setKnowledge] = useState(false);

  const today = todayIso();
  const load = useCallback(async () => setLogs(await dailyLogsSince(28)), []);
  useEffect(() => {
    void load();
  }, [load]);

  const taken = logs.find((l) => l.log_date === today)?.creatine_taken === true;
  const last14 = logs.filter((l) => l.creatine_taken === true).length;

  async function toggle() {
    await saveDailyLog(today, { creatine_taken: !taken });
    await load();
  }

  return (
    <section className="sy-mod">
      <div className="sy-mod__head">
        <span className="sy-mod__name">Kreatyna</span>
        <button type="button" className="sy-mod__note" onClick={() => setKnowledge(true)}>
          co o tym wiadomo
        </button>
      </div>

      <p className="sy-sub">
        Cel: <span className="num">5 g</span> dziennie, również w dni bez treningu. W ostatnich
        28 dniach: <span className="num">{last14}</span>.
      </p>

      <div className="sy-mod__row">
        <button type="button" className="sy-toggle" aria-pressed={taken} onClick={() => void toggle()}>
          {taken ? "Wzięte dzisiaj" : "Zaznacz wzięcie"}
        </button>
      </div>

      <Sheet open={knowledge} title="Kreatyna" onClose={() => setKnowledge(false)}>
        <p>
          Monohydrat jest najskuteczniejszym suplementem w zakresie wydolności wysiłków o wysokiej
          intensywności i beztłuszczowej masy ciała. Brak dowodów na szkodliwość przy stosowaniu do
          30 g na dobę przez 5 lat u zdrowych osób. Nasycenie następuje po około 4 tygodniach.
          <SourceChip sourceKey="kreider2017" />
        </p>
        <p>
          Nie kupuj kreatyny HCl ani innych form. Monohydrat jest najlepiej przebadany i najtańszy.
        </p>
        <p>
          Kotwica: postaw słoik obok szczoteczki do zębów. Nowe zachowanie łatwiej przyklejasz do
          istniejącego niż do godziny na zegarze.
        </p>
      </Sheet>
    </section>
  );
}
