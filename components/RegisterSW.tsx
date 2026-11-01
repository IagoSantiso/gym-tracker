"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (solo en producción) y, cuando ya controla la página,
 * le pasa la lista de recursos cargados para que queden en caché y la app arranque
 * sin conexión desde la primera visita.
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    const precacheLoaded = async () => {
      const reg = await navigator.serviceWorker.ready;
      const urls = new Set<string>([location.pathname]);
      performance.getEntriesByType("resource").forEach((e) => {
        const u = new URL(e.name);
        if (u.origin === location.origin && (u.pathname.startsWith("/_next/static/") || u.pathname.startsWith("/exercises/"))) {
          urls.add(u.pathname + u.search);
        }
      });
      reg.active?.postMessage({ type: "CACHE_URLS", urls: [...urls] });
    };

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then(() => precacheLoaded())
        .catch(() => {});
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
