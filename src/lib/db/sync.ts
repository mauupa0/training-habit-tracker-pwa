// Silnik synchronizacji: kolejka lokalna → Supabase.
//
// Zasady, od których nie ma odstępstw:
//  · zapis użytkownika trafia najpierw do IndexedDB i jest natychmiast widoczny,
//  · sync nigdy nie blokuje interfejsu i nigdy nie pokazuje modala,
//  · brak sieci nie jest błędem - operacja po prostu czeka.

import { db, CONFLICT_KEY, LOCAL_STORE, PRIMARY_KEY, nowIso } from "./local";
import { supabase } from "@/lib/supabase/client";
import type { SyncOp, SyncTable } from "@/types";

const MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 2_000;
const RETRY_CAP_MS = 5 * 60_000;
const POLL_MS = 60_000;

export type SyncStatus = {
  /** operacje czekające na wysłanie */
  pending: number;
  /** operacje, które wyczerpały próby i czekają na ręczne wznowienie */
  blocked: number;
  online: boolean;
  lastError: string | null;
};

let flushing = false;
let poller: ReturnType<typeof setInterval> | null = null;
let started = false;
let lastError: string | null = null;

const listeners = new Set<(status: SyncStatus) => void>();

export function subscribeSync(fn: (status: SyncStatus) => void): () => void {
  listeners.add(fn);
  void emit();
  return () => listeners.delete(fn);
}

async function emit(): Promise<void> {
  if (listeners.size === 0) return;
  const status = await getSyncStatus();
  listeners.forEach((fn) => fn(status));
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const all = await db.syncQueue.toArray();
  return {
    pending: all.filter((o) => o.attempts < MAX_ATTEMPTS).length,
    blocked: all.filter((o) => o.attempts >= MAX_ATTEMPTS).length,
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    lastError,
  };
}

/**
 * Dopisuje operację do kolejki. Wołane przez warstwę zapisu PO tym,
 * jak rekord wylądował już w Dexie.
 */
export async function enqueue(
  table: SyncTable,
  op: SyncOp["op"],
  rowKey: string,
  payload: Record<string, unknown>
): Promise<void> {
  await db.syncQueue.add({
    table,
    op,
    row_key: rowKey,
    payload,
    created_at: nowIso(),
    attempts: 0,
    next_attempt_at: 0,
    last_error: null,
  });
  void emit();
  void flush();
}

/** Wykładniczy backoff z sufitem - po wyczerpaniu prób operacja czeka na `retryBlocked()`. */
function backoffMs(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** attempts, RETRY_CAP_MS);
}

const NETWORK_MESSAGE = /failed to fetch|networkerror|load failed|fetch failed|err_internet|err_network/i;

/**
 * Czy to padła sieć, czy odrzuciła baza.
 *
 * supabase-js nie rzuca przy zerwanym połączeniu - oddaje je w polu `error`
 * o tym samym kształcie co błąd PostgREST, tyle że z pustym `code`. Wcześniejsza
 * wersja uznawała każdy taki błąd za błąd bazy: seria zapisana na siłowni zużywała
 * próbę i dostawała backoff, więc po powrocie sieci wisiała w kolejce minutami.
 * Błąd bazy MUSI zużywać próbę, brak sieci - nigdy.
 */
function networkFailure(err: unknown, message: string): boolean {
  const code = (err as { postgrest?: { code?: string } }).postgrest?.code;
  if (code) return false; // PostgREST się odezwał, to nie jest problem z siecią
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return NETWORK_MESSAGE.test(message) || err instanceof TypeError;
}

async function sendOne(op: SyncOp): Promise<void> {
  const pk = PRIMARY_KEY[op.table];

  if (op.op === "delete") {
    const { error } = await supabase.from(op.table).delete().eq(pk, op.row_key);
    if (error) throw Object.assign(new Error(error.message), { postgrest: error });
    return;
  }

  // insert i update idą tą samą drogą: przy jednym użytkowniku upsert po kluczu
  // rozstrzyga konflikt jako last-write-wins, zgodnie z założeniem projektu.
  const { error } = await supabase
    .from(op.table)
    .upsert(op.payload, { onConflict: CONFLICT_KEY[op.table] });
  if (error) throw Object.assign(new Error(error.message), { postgrest: error });
}

/** Czy dany wiersz ma jeszcze inne operacje w kolejce (wtedy nie znaczymy go jako zsynchronizowanego). */
async function hasPendingFor(table: SyncTable, rowKey: string): Promise<boolean> {
  const rest = await db.syncQueue.where("table").equals(table).toArray();
  return rest.some((o) => o.row_key === rowKey);
}

async function markSynced(table: SyncTable, rowKey: string): Promise<void> {
  if (await hasPendingFor(table, rowKey)) return;
  const storeName = LOCAL_STORE[table];
  const store = (db as unknown as Record<string, { update: (k: unknown, c: Record<string, unknown>) => Promise<number> }>)[storeName];
  const key: unknown = table === "program_state" ? Number(rowKey) : rowKey;
  try {
    await store.update(key, { synced: 1 });
  } catch {
    // rekord mógł zostać w międzyczasie usunięty lokalnie - to nie jest błąd synchronizacji
  }
}

/**
 * Przetwarza kolejkę po kolei. Wychodzi cicho, gdy nie ma sieci albo gdy
 * inny przebieg już trwa. Nigdy nie rzuca w górę.
 */
export async function flush(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  flushing = true;
  try {
    // Bez sesji nie ma do czego wysyłać - polityki RLS i tak by odrzuciły zapis.
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;

    for (;;) {
      const now = Date.now();
      const queue = await db.syncQueue.orderBy("seq").toArray();
      const next = queue.find((o) => o.attempts < MAX_ATTEMPTS && o.next_attempt_at <= now);
      if (!next) break;

      try {
        await sendOne(next);
        await db.syncQueue.delete(next.seq!);
        await markSynced(next.table, next.row_key);
        lastError = null;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isNetwork = networkFailure(err, message);

        if (isNetwork) {
          // Sieć padła w trakcie - nie zużywamy próby, wracamy przy następnym zdarzeniu.
          lastError = null;
          break;
        }

        const attempts = next.attempts + 1;
        lastError = message;
        await db.syncQueue.update(next.seq!, {
          attempts,
          last_error: message,
          next_attempt_at: Date.now() + backoffMs(attempts),
        });
        if (attempts >= MAX_ATTEMPTS) break;
      }
    }
  } finally {
    flushing = false;
    void emit();
  }
}

/** Ręczne wznowienie operacji, które wyczerpały próby. */
export async function retryBlocked(): Promise<void> {
  const blocked = await db.syncQueue.filter((o) => o.attempts >= MAX_ATTEMPTS).toArray();
  await Promise.all(
    blocked.map((o) => db.syncQueue.update(o.seq!, { attempts: 0, next_attempt_at: 0 }))
  );
  lastError = null;
  await flush();
}

/** Podpina wyzwalacze: powrót sieci, powrót do karty, cykliczne sprawdzenie. */
export function startSync(): () => void {
  if (typeof window === "undefined" || started) return () => {};
  started = true;

  // Powrót sieci unieważnia odczekiwanie: to nowa informacja, nie kolejna próba
  // w ciemno. Bez tego operacja z wcześniejszym backoffem czekałaby do jego końca.
  const onOnline = () =>
    void (async () => {
      const waiting = await db.syncQueue.filter((o) => o.next_attempt_at > Date.now()).toArray();
      await Promise.all(
        waiting.map((o) => db.syncQueue.update(o.seq!, { next_attempt_at: 0 }))
      );
      await flush();
    })();
  const onVisible = () => {
    if (document.visibilityState === "visible") void flush();
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", () => void emit());
  document.addEventListener("visibilitychange", onVisible);
  poller = setInterval(() => void flush(), POLL_MS);

  void flush();

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    if (poller) clearInterval(poller);
    started = false;
  };
}
