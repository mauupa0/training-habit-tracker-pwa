// Świeża sesja konta testowego dla harnessów e2e. Tokeny żyją godzinę, więc każda
// dłuższa sesja pracy potrzebuje ich od nowa - bez tego skryptu pisało się to za każdym razem.
//
//   SUPABASE_PAT=sbp_… node e2e-login.cjs system-e2e@example.com ../.tmp/sess.json
//
// PAT (token Management API) trzymaj poza repo.
// Konto zakładane jest z potwierdzonym mailem, więc magic link nie wychodzi na pocztę.
const fs = require("fs");
const path = require("path");

const PAT = process.env.SUPABASE_PAT;
const [email, out] = process.argv.slice(2);
if (!PAT || !email || !out) {
  console.error("SUPABASE_PAT=sbp_… node e2e-login.cjs <email> <plik.json>");
  process.exit(2);
}

const envLocal = fs.readFileSync(path.join(__dirname, ".env.local"), "utf8");
const URL_BASE = /NEXT_PUBLIC_SUPABASE_URL=(.+)/.exec(envLocal)[1].trim();
const REF = new URL(URL_BASE).hostname.split(".")[0];

async function apiKeys() {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${PAT}`, "User-Agent": "Mozilla/5.0" },
  });
  if (!r.ok) throw new Error(`api-keys ${r.status}: ${await r.text()}`);
  const list = await r.json();
  return {
    secret: list.find((k) => k.type === "secret")?.api_key,
    pub: list.find((k) => k.type === "publishable")?.api_key,
  };
}

(async () => {
  const { secret, pub } = await apiKeys();

  // konto mogło zostać sprzątnięte - zakładamy je ponownie, 422 znaczy „już jest”
  const created = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (created.status >= 400 && created.status !== 422) {
    throw new Error(`createUser ${created.status}: ${await created.text()}`);
  }

  const linkRes = await fetch(`${URL_BASE}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const link = await linkRes.json();
  if (!link.hashed_token) throw new Error(`generate_link ${linkRes.status}: ${JSON.stringify(link)}`);

  // wymiana tokenu na sesję idzie kluczem publicznym - to ta sama droga co w przeglądarce
  const verify = await fetch(`${URL_BASE}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: pub, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }),
  });
  const session = await verify.json();
  if (!session.access_token) throw new Error(`verify ${verify.status}: ${JSON.stringify(session)}`);

  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify({ url: URL_BASE, user_id: session.user.id, email, secret, pub, session }, null, 1)
  );
  console.log(`sesja ${email} → ${out} (ważna godzinę)`);
})();
