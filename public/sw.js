// Service worker pisany ręcznie - bez next-pwa, bo warstwa offline aplikacji
// siedzi w IndexedDB, a tutaj potrzebna jest tylko powłoka i statyki.
//
// Powłoka: cache-first (ma się otworzyć w trybie samolotowym).
// Dane: sieć, bez cache - odpowiedzi z Supabase nigdy nie trafiają do pamięci podręcznej,
// bo źródłem prawdy jest lokalna baza, a nie stara kopia odpowiedzi.

const CACHE = "system-v1";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-") ||
    /\.(?:woff2?|png|svg|ico)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // wszystko spoza własnego origin (m.in. Supabase) idzie prosto do sieci
  if (url.origin !== self.location.origin) return;

  // nawigacja: najpierw sieć, w razie jej braku ostatnia znana powłoka
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then((r) => r ?? Response.error()))
    );
    return;
  }

  // statyki z hashem w nazwie: z pamięci, dociągane raz
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          })
      )
    );
  }
});
