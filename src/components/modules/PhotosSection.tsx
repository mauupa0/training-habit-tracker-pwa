"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { todayIso } from "@/lib/day";
import { photos } from "@/lib/db/queries";
import { photoUrl, savePhoto } from "@/lib/db/repo";
import { PHOTO_EVERY_DAYS, isDue } from "@/lib/domain/measure";
import type { LocalProgramState, LocalProgressPhoto, ProgressPhoto } from "@/types";

const POSES: Array<[NonNullable<ProgressPhoto["pose"]>, string]> = [
  ["front", "Przód"],
  ["side", "Bok"],
  ["back", "Tył"],
];

/**
 * Zdjęcia postępu co cztery tygodnie. Porównanie jest zawsze dwoma kadrami obok
 * siebie - żadnych nakładek, prognoz sylwetki ani porównań z kimkolwiek innym (R3).
 */
export function PhotosSection({ state }: { state: LocalProgramState }) {
  const [rows, setRows] = useState<LocalProgressPhoto[]>([]);
  const [pose, setPose] = useState<NonNullable<ProgressPhoto["pose"]>>("front");
  const [left, setLeft] = useState<string>("");
  const [right, setRight] = useState<string>("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const today = todayIso();

  const load = useCallback(async () => {
    const all = await photos();
    setRows(all);
    if (all.length >= 2) {
      setLeft((prev) => prev || all[all.length - 1].id);
      setRight((prev) => prev || all[0].id);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Adresy są podpisane i wygasają - pobieramy je dopiero dla tego, co widać.
  useEffect(() => {
    void (async () => {
      const wanted = rows.filter((r) => r.id === left || r.id === right || rows.indexOf(r) < 3);
      const next: Record<string, string> = {};
      for (const row of wanted) {
        const url = await photoUrl(row.storage_path);
        if (url) next[row.id] = url;
      }
      setUrls(next);
    })();
  }, [rows, left, right]);

  const due = isDue(rows[0]?.taken_on ?? null, today, PHOTO_EVERY_DAYS, state.started_on);

  async function upload(input: File | undefined) {
    if (!input) return;
    setError(null);
    try {
      await savePhoto(input, today, pose);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się zapisać zdjęcia.");
    }
  }

  const byId = (id: string) => rows.find((r) => r.id === id);

  return (
    <section className="sy-section">
      <h2 className="sy-section__title">Zdjęcia</h2>

      <p className="sy-sub">
        Zmiana o <span className="num">2 kg</span> mięśni jest niewidoczna dzień po dniu w lustrze,
        ale rzuca się w oczy na zdjęciach z odstępem 8 tygodni. To samo światło, ta sama pora, ta
        sama poza.
        {due && rows.length > 0 && " Minęły cztery tygodnie od ostatniej serii."}
      </p>

      <div className="sy-scale" role="group" aria-label="Poza">
        {POSES.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="sy-scale__item"
            aria-pressed={pose === key}
            onClick={() => setPose(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="sy-mod__row">
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          hidden
          onChange={(e) => void upload(e.target.files?.[0])}
        />
        <button type="button" className="sy-btn" onClick={() => file.current?.click()}>
          Dodaj zdjęcie
        </button>
        <span className="sy-mod__note">{rows.length} w archiwum</span>
      </div>

      {error && <p className="sy-alert">{error}</p>}

      {rows.length >= 2 && (
        <>
          <div className="sy-mod__row">
            <select
              className="sy-input"
              aria-label="Zdjęcie po lewej"
              value={left}
              onChange={(e) => setLeft(e.target.value)}
            >
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.taken_on} · {POSES.find(([k]) => k === r.pose)?.[1] ?? "-"}
                </option>
              ))}
            </select>
            <select
              className="sy-input"
              aria-label="Zdjęcie po prawej"
              value={right}
              onChange={(e) => setRight(e.target.value)}
            >
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.taken_on} · {POSES.find(([k]) => k === r.pose)?.[1] ?? "-"}
                </option>
              ))}
            </select>
          </div>

          <div className="sy-shots">
            {[left, right].map((id, i) => {
              const row = byId(id);
              return (
                <div className="sy-shots__cell" key={`${id}-${i}`}>
                  {urls[id] ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img className="sy-shots__img" src={urls[id]} alt={`Zdjęcie z ${row?.taken_on}`} />
                  ) : (
                    <div className="sy-shots__img" style={{ aspectRatio: "3 / 4" }} />
                  )}
                  <span className="sy-shots__cap num">{row?.taken_on ?? ""}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
