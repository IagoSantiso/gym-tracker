/* NEXO – service worker
 *  - Navegación: stale-while-revalidate POR RUTA (abre al instante sin cobertura, actualiza en segundo plano).
 *  - /_next/static, /exercises, /icons, manifest, worker pdf: cache-first.
 *  - /api/* y peticiones RSC (?_rsc): solo red; si falla, Next hace navegación completa y se sirve el HTML cacheado.
 *  - Instalación: precarga todas las rutas de precache.json, los chunks que referencia cada HTML y las fotos.
 */
const VERSION = "v2";
const CACHE = `nexo-${VERSION}`;
const STATIC_PREFIXES = ["/_next/static/", "/exercises/", "/icons/"];
const STATIC_EXACT = ["/manifest.webmanifest", "/pdf.worker.min.mjs"];

const norm = (p) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);
const isStatic = (url) =>
  url.origin === self.location.origin && (STATIC_PREFIXES.some((p) => url.pathname.startsWith(p)) || STATIC_EXACT.includes(url.pathname));

function chunkUrls(html) {
  const found = new Set();
  const re = /\/_next\/static\/[A-Za-z0-9_\-./%~@\[\]]+\.(?:js|css|woff2?|json)/g;
  for (const m of html.matchAll(re)) found.add(m[0]);
  return [...found];
}

async function cacheShell(path, response) {
  const cache = await caches.open(CACHE);
  const html = await response.clone().text();
  await cache.put(path, response);
  const missing = [];
  for (const u of chunkUrls(html)) if (!(await cache.match(u))) missing.push(u);
  await Promise.all(missing.map((u) => cache.add(u).catch(() => {})));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      let pre = { routes: ["/"], urls: [] };
      try {
        pre = await (await fetch("/precache.json", { cache: "reload" })).json();
      } catch {}
      const routes = pre.routes && pre.routes.length ? pre.routes : ["/"];
      const home = await fetch("/", { cache: "reload" });
      if (!home.ok) throw new Error("No se pudo descargar la app");
      await cacheShell("/", home);
      await Promise.all(
        routes.filter((r) => r !== "/").map(async (r) => {
          try {
            const res = await fetch(r, { cache: "reload" });
            if (res.ok) await cacheShell(r, res);
          } catch {}
        }),
      );
      const rest = (pre.urls || []).filter((u) => !routes.includes(u));
      await Promise.all(rest.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => (n.startsWith("gym-") || n.startsWith("nexo-")) && n !== CACHE).map((n) => caches.delete(n)));
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
        if (!isStatic(url) || (await cache.match(url.pathname + url.search))) continue;
        await cache.add(url.pathname + url.search).catch(() => {});
      }
    })(),
  );
});

const offlinePage = () =>
  new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title><body style="font-family:system-ui;background:#0c110e;color:#eef3ec;padding:24px"><h1>Sin conexión</h1><p>Esta pantalla aún no está guardada para uso offline.</p><p><a style="color:#c5f36b" href="/">Volver a Hoy</a></p></body>',
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.searchParams.has("_rsc") || req.headers.get("RSC") === "1") return;

  if (req.mode === "navigate") {
    const key = norm(url.pathname);
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(key);
        const refresh = fetch(req.url, { cache: "no-cache" })
          .then(async (res) => {
            if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) await cacheShell(key, res.clone());
            return res;
          })
          .catch(() => null);
        if (cached) {
          event.waitUntil(refresh);
          return cached;
        }
        return (await refresh) || offlinePage();
      })(),
    );
    return;
  }

  if (isStatic(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req, { ignoreSearch: url.pathname.startsWith("/exercises/") });
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
  }
});
