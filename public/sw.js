/* Gym Tracker – service worker
 *
 * Estrategias:
 *  - Navegación (HTML):  stale-while-revalidate sobre "/" -> abre al instante aunque no haya cobertura
 *                        y se actualiza en segundo plano cuando hay red.
 *  - /_next/static, /exercises, /icons, manifest: cache-first (los chunks llevan hash; las fotos no cambian).
 *  - Todo lo demás (otros orígenes, p. ej. Supabase en la Fase 2) NO se intercepta.
 *
 * Instalación: precarga "/", los chunks que referencia ese HTML y todo lo de /precache.json
 * (fotos, iconos, manifest), así que tras la primera visita online funciona en modo avión.
 */
const VERSION = "v1";
const CACHE = `gym-${VERSION}`;
const SHELL = "/";
const STATIC_PREFIXES = ["/_next/static/", "/exercises/", "/icons/"];
const STATIC_EXACT = ["/manifest.webmanifest"];

const isStatic = (url) =>
  url.origin === self.location.origin &&
  (STATIC_PREFIXES.some((p) => url.pathname.startsWith(p)) || STATIC_EXACT.includes(url.pathname));

/** Extrae rutas /_next/static/... del HTML (etiquetas script/link y payload RSC). */
function chunkUrls(html) {
  const found = new Set();
  const re = /\/_next\/static\/[A-Za-z0-9_\-./%~@\[\]]+\.(?:js|css|woff2?|json)/g;
  for (const m of html.matchAll(re)) found.add(m[0]);
  return [...found];
}

async function cacheShell(response) {
  const cache = await caches.open(CACHE);
  const html = await response.clone().text();
  await cache.put(SHELL, response);
  const missing = [];
  for (const u of chunkUrls(html)) {
    if (!(await cache.match(u))) missing.push(u);
  }
  await Promise.all(missing.map((u) => cache.add(u).catch(() => {})));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const res = await fetch(SHELL, { cache: "reload" });
      if (!res.ok) throw new Error("No se pudo descargar la app");
      await cacheShell(res);
      try {
        const pre = await (await fetch("/precache.json", { cache: "reload" })).json();
        const rest = pre.urls.filter((u) => u !== SHELL);
        await Promise.all(rest.map((u) => cache.add(new Request(u, { cache: "reload" }))));
      } catch (err) {
        // Sin precache.json (p. ej. build antiguo): seguirá funcionando con caché en uso.
        console.warn("[sw] precache parcial", err);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("gym-") && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "CACHE_URLS" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const raw of data.urls) {
        const url = new URL(raw, self.location.origin);
        if (!isStatic(url)) continue;
        if (await cache.match(url.pathname + url.search)) continue;
        await cache.add(url.pathname + url.search).catch(() => {});
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegación -> SWR sobre el shell
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(SHELL);
        const refresh = fetch(SHELL, { cache: "no-cache" })
          .then(async (res) => {
            if (res.ok) await cacheShell(res);
            return res;
          })
          .catch(() => null);
        if (cached) {
          event.waitUntil(refresh);
          return cached;
        }
        return (await refresh) || new Response("Sin conexión y la app aún no se ha descargado.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      })(),
    );
    return;
  }

  // Estáticos -> cache-first
  if (isStatic(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
  }
});
