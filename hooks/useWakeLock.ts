"use client";

import { useEffect, useState } from "react";

/**
 * Mantiene la pantalla encendida mientras `active` sea true.
 * - El navegador libera el bloqueo al ocultar la pestaña: se vuelve a pedir al volver.
 * - Sin soporte (Safari antiguo, Firefox) o si falla: no hace nada, sin errores.
 */
export function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    let pending = false;

    const acquire = async () => {
      if (pending || document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      pending = true;
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) {
          s.release().catch(() => {});
          return;
        }
        sentinel = s;
        setHeld(true);
        s.addEventListener("release", () => {
          if (sentinel === s) setHeld(false);
        });
      } catch {
        /* denegado (ahorro de batería, etc.): fallback silencioso */
      } finally {
        pending = false;
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      sentinel?.release().catch(() => {});
      sentinel = null;
      setHeld(false);
    };
  }, [active]);

  return held;
}
