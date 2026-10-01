"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

/**
 * Aplikacja ma jedno konto, więc logowanie jest jednym polem. Adres siedzi
 * w konfiguracji, nie na ekranie: przepisywanie go przy każdym wejściu na telefonie
 * było czystą stratą czasu, a linki z poczty i tak trzeba było otwierać na tym
 * samym urządzeniu.
 */
const OWNER_EMAIL = process.env.NEXT_PUBLIC_OWNER_EMAIL ?? "";

export function AuthScreen() {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!OWNER_EMAIL) {
      setError("Brak NEXT_PUBLIC_OWNER_EMAIL w konfiguracji. Wpisz adres konta właściciela do .env.local.");
      return;
    }
    setState("sending");
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: OWNER_EMAIL,
      password,
    });

    if (error) {
      // Treść błędu z serwera jest po angielsku i mówi o e-mailu, którego tu nie ma.
      setError(
        /invalid login/i.test(error.message)
          ? "Hasło nie pasuje."
          : `Nie udało się zalogować: ${error.message}`
      );
      setState("idle");
      setPassword("");
      return;
    }
    // sesję przejmuje AppGate przez onAuthStateChange
  }

  return (
    <main className="sy-screen sy-screen--center">
      <h1 className="sy-title sy-title--entry">System</h1>
      <p className="sy-lead">Dziennik treningowy.</p>

      <form onSubmit={submit}>
        <label htmlFor="password" className="sy-label">
          Hasło
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="sy-input"
        />

        <button type="submit" disabled={state === "sending" || password.length === 0} className="sy-btn">
          {state === "sending" ? "Wchodzę…" : "Wejdź"}
        </button>

        {error && <p className="sy-alert">{error}</p>}
      </form>
    </main>
  );
}
