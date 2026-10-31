"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KEYS, store } from "@/lib/storage";

interface Persisted {
  base: number;
  secs: number;
  endAt: number | null;
}

export interface FinishInfo {
  /** El descanso terminó con la pantalla bloqueada / app en segundo plano */
  late: boolean;
}

/**
 * Temporizador de descanso basado en la HORA DE FIN (endAt), no en contar ticks.
 * Si el móvil bloquea la pantalla o el navegador congela el JS, al volver
 * (visibilitychange / pageshow / focus) se recalcula contra Date.now().
 */
export function useRestTimer(onFinish: (info: FinishInfo) => void) {
  const [base, setBase] = useState(90);
  const [secs, setSecs] = useState(90);
  const [running, setRunning] = useState(false);
  /** Pausado a mitad (el botón muestra "Seguir" en vez de "Iniciar") */
  const [paused, setPaused] = useState(false);
  /** Se incrementa al terminar para relanzar la animación de destello */
  const [flash, setFlash] = useState(0);

  const endAt = useRef(0);
  const runningRef = useRef(false);
  const hydrated = useRef(false);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  const remaining = () => Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));

  const finish = useCallback(() => {
    if (!runningRef.current) return; // evita doble disparo (interval + visibilitychange)
    runningRef.current = false;
    const late = Date.now() - endAt.current > 2000;
    setRunning(false);
    setPaused(false);
    setSecs(0);
    setFlash((n) => n + 1);
    onFinishRef.current({ late });
  }, []);

  const tick = useCallback(() => {
    if (!runningRef.current) return;
    const r = remaining();
    setSecs(r);
    if (r <= 0) finish();
  }, [finish]);

  // Bucle de actualización + resincronización al volver a la app
  useEffect(() => {
    if (!running) return;
    tick();
    const iv = setInterval(tick, 250);
    const resync = () => tick();
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("pageshow", resync);
    window.addEventListener("focus", resync);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("pageshow", resync);
      window.removeEventListener("focus", resync);
    };
  }, [running, tick]);

  // Restaurar tras recargar / matar la app durante un descanso
  useEffect(() => {
    const p = store.get<Persisted | null>(KEYS.timer, null);
    if (p && Number.isFinite(p.base) && p.base > 0) {
      setBase(p.base);
      if (p.endAt && p.endAt > Date.now()) {
        endAt.current = p.endAt;
        runningRef.current = true;
        setSecs(Math.max(0, Math.ceil((p.endAt - Date.now()) / 1000)));
        setRunning(true);
      } else {
        setSecs(p.endAt ? 0 : Math.max(0, p.secs));
      }
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    store.set(KEYS.timer, {
      base,
      secs,
      endAt: running ? endAt.current : null,
    } satisfies Persisted);
  }, [base, secs, running]);

  const run = useCallback((s: number) => {
    endAt.current = Date.now() + s * 1000;
    runningRef.current = true;
    setSecs(s);
    setPaused(false);
    setRunning(true);
  }, []);

  const start = useCallback(
    (s: number) => {
      setBase(s);
      run(s);
    },
    [run],
  );

  const toggle = useCallback(() => {
    if (runningRef.current) {
      const r = remaining();
      runningRef.current = false;
      setSecs(r);
      setRunning(false);
      setPaused(true);
    } else {
      run(secs <= 0 ? base : secs);
    }
  }, [base, secs, run]);

  const adjust = useCallback(
    (delta: number) => {
      if (runningRef.current) {
        endAt.current += delta * 1000;
        const next = remaining();
        setSecs(next);
        if (delta > 0) setBase((b) => Math.max(b, next));
        if (next <= 0) finish();
      } else {
        const next = Math.max(0, secs + delta);
        setSecs(next);
        if (delta > 0) setBase((b) => Math.max(b, next));
      }
    },
    [secs, finish],
  );

  const reset = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    setPaused(false);
    setSecs(base);
  }, [base]);

  return { base, secs, running, paused, flash, start, toggle, adjust, reset };
}
