import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Klucz publishable (sb_publishable_…), nie stary klucz anon.
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "Brak NEXT_PUBLIC_SUPABASE_URL lub NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY w środowisku."
  );
}

/**
 * Dane Systemu żyją w osobnym schemacie `system`.
 * Własny storageKey - sesja Systemu nie miesza się z sesją innej aplikacji na tej samej domenie.
 */
export const supabase = createClient(url, publishableKey, {
  db: { schema: "system" },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "system-auth",
  },
});
