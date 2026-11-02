"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

/**
 * Registra el service worker (solo en producción) con la versión del despliegue en la URL:
 * cada despliegue instala un SW nuevo. Si ya había una versión controlando la página, avisa
 * con un banner para recargar (no se recarga sola para no cortar una sesión de entreno).
 */
export function RegisterSW() {
  const [updated, setUpdated] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;

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

    const onControllerChange = () => {
      if (hadController) setUpdated(true);
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let reg: ServiceWorkerRegistration | undefined;
    const check = () => {
      if (document.visibilityState === "visible") void reg?.update().catch(() => {});
    };
    const onLoad = () => {
      navigator.serviceWorker
        .register(`/sw.js?v=${encodeURIComponent(BUILD)}`, { scope: "/", updateViaCache: "none" })
        .then((r) => {
          reg = r;
          return precacheLoaded();
        })
        .catch(() => {});
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    document.addEventListener("visibilitychange", check);
    const t = setInterval(check, 30 * 60_000);
    return () => {
      window.removeEventListener("load", onLoad);
      document.removeEventListener("visibilitychange", check);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      clearInterval(t);
    };
  }, []);

  if (!updated) return null;
  return (
    <div className="update-banner" role="status">
      <Icon name="sync" />
      <span>Hay una versión nueva de NEXO.</span>
      <button className="btn sm primary" onClick={() => location.reload()}>Actualizar</button>
      <button className="icon-btn" aria-label="Más tarde" onClick={() => setUpdated(false)}><Icon name="x" /></button>
    </div>
  );
}
