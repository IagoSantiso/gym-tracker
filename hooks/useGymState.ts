"use client";

import { useCallback, useEffect, useState } from "react";
import { PLANS } from "@/lib/plan";
import { KEYS, store } from "@/lib/storage";
import type { LoadsState, LogEntry, PlanMode, SetsState, UIState } from "@/lib/types";

const DEFAULT_UI: UIState = { mode: 3, day: 0, adapt: false };

/**
 * Estado persistente de la app. Mantiene las MISMAS claves y formas de
 * localStorage que el HTML original (gymUI, gymSets, gymLoads, gymLogs).
 * Todas las acciones son estables (useCallback sin dependencias) para poder
 * memoizar las tarjetas.
 */
export function useGymState() {
  const [hydrated, setHydrated] = useState(false);
  const [ui, setUi] = useState<UIState>(DEFAULT_UI);
  const [sets, setSets] = useState<SetsState>({});
  const [loads, setLoads] = useState<LoadsState>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Cargar tras el montaje (evita desajustes de hidratación con el HTML prerenderizado)
  useEffect(() => {
    const saved = store.get<Partial<UIState>>(KEYS.ui, {});
    const mode: PlanMode = saved.mode === 2 ? 2 : 3;
    const day = Number.isInteger(saved.day) && saved.day! < PLANS[mode].length && saved.day! >= 0 ? saved.day! : 0;
    setUi({ mode, day, adapt: !!saved.adapt });
    setSets(store.get<SetsState>(KEYS.sets, {}));
    setLoads(store.get<LoadsState>(KEYS.loads, {}));
    setLogs(store.get<LogEntry[]>(KEYS.logs, []));
    setHydrated(true);
  }, []);

  // Persistir (solo tras cargar, para no pisar datos con los valores por defecto)
  useEffect(() => { if (hydrated) store.set(KEYS.ui, ui); }, [ui, hydrated]);
  useEffect(() => { if (hydrated) store.set(KEYS.sets, sets); }, [sets, hydrated]);
  useEffect(() => { if (hydrated) store.set(KEYS.loads, loads); }, [loads, hydrated]);
  useEffect(() => { if (hydrated) store.set(KEYS.logs, logs); }, [logs, hydrated]);

  const setMode = useCallback((mode: PlanMode) => {
    setUi((u) => (u.mode === mode ? u : { ...u, mode, day: 0 }));
  }, []);
  const setDay = useCallback((day: number) => setUi((u) => ({ ...u, day })), []);
  const setAdapt = useCallback((adapt: boolean) => setUi((u) => ({ ...u, adapt })), []);

  /** Alterna la serie `index` del ejercicio `key`. */
  const toggleSet = useCallback((key: string, index: number) => {
    setSets((s) => {
      const prev = s[key] ?? [];
      const next = Array.from({ length: Math.max(prev.length, index + 1) }, (_, i) => !!prev[i]);
      next[index] = !next[index];
      return { ...s, [key]: next };
    });
  }, []);

  /** Marca o desmarca todas las series (n) de un ejercicio. */
  const setAllSets = useCallback((key: string, n: number, value: boolean) => {
    setSets((s) => ({ ...s, [key]: Array.from({ length: n }, () => value) }));
  }, []);

  const setLoad = useCallback((key: string, field: "weight" | "reps", value: string) => {
    setLoads((l) => ({ ...l, [key]: { ...l[key], [field]: value } }));
  }, []);

  const clearSets = useCallback((keys: string[]) => {
    setSets((s) => {
      const next = { ...s };
      keys.forEach((k) => delete next[k]);
      return next;
    });
  }, []);

  const addLog = useCallback((entry: LogEntry) => setLogs((l) => [...l, entry]), []);

  return {
    hydrated, ui, sets, loads, logs,
    setMode, setDay, setAdapt, toggleSet, setAllSets, setLoad, clearSets, addLog,
  };
}
