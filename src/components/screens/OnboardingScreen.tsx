"use client";

import { useState } from "react";
import { todayIso } from "@/lib/day";
import { saveDailyLog, saveProgramState } from "@/lib/db/repo";
import type { IsoDate } from "@/types";

/**
 * Trzy pola i koniec. Onboarding nawykowy - plany jeśli-to
 * i WOOP - wchodzi dopiero w fazie 3.
 */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [startedOn, setStartedOn] = useState<string>(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heightCm = Number(height.replace(",", "."));
  const weightKg = Number(weight.replace(",", "."));
  // puste pole to Number("") = 0, więc bez zakresu onboarding zapisałby wzrost i wagę równe zero
  const valid =
    height.trim() !== "" &&
    weight.trim() !== "" &&
    heightCm >= 100 &&
    heightCm <= 250 &&
    weightKg >= 30 &&
    weightKg <= 300;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await saveProgramState({
        height_cm: heightCm,
        started_on: startedOn as IsoDate,
      });
      await saveDailyLog(startedOn as IsoDate, { weight_kg: weightKg });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="sy-screen sy-screen--center">
      <h1 className="sy-title sy-title--entry">Trzy dane na start</h1>

      <form onSubmit={submit} className="mt-5">
        <Field label="Wzrost (cm)">
          <NumberInput value={height} onChange={setHeight} inputMode="numeric" />
        </Field>

        <Field label="Waga startowa (kg)">
          <NumberInput value={weight} onChange={setWeight} inputMode="decimal" />
        </Field>

        <Field label="Data startu">
          <input
            type="date"
            value={startedOn}
            onChange={(e) => setStartedOn(e.target.value)}
            className="sy-input num"
            required
          />
        </Field>

        <button type="submit" disabled={busy || !valid} className="sy-btn">
          {busy ? "Zapisuję…" : "Zapisz"}
        </button>

        {!valid && (height !== "" || weight !== "") && <p className="sy-sub">Wzrost 100-250 cm, waga 30-300 kg.</p>}
        {error && <p className="sy-alert">Nie udało się zapisać: {error}</p>}
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="sy-field">
      <span className="sy-label">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  inputMode: "numeric" | "decimal";
}) {
  return (
    <input
      type="text"
      inputMode={inputMode}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="sy-input num"
      required
    />
  );
}
