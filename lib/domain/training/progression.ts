/**
 * Progresión de cargas y métricas de fuerza. Todo determinista y testeado.
 * - Doble progresión: si en la última sesión TODAS las series de trabajo llegaron al máximo del rango
 *   (y con RIR ≥ objetivo si se registró) → sugerir +incremento; si no → mantener.
 * - La sugerencia NUNCA se aplica sola: la UI la muestra como "Hoy: X kg" con botón Aplicar
 *   (salvo que el usuario active autoApplyProgression).
 */
import type { ExerciseSet, MuscleId } from "@/lib/db/types";
import type { LibraryExercise } from "./library";

export interface SetLike {
  weightKg?: number | null;
  reps?: number | null;
  rir?: number | null;
  completed: boolean;
  isWarmup: boolean;
}

export interface Suggestion {
  weightKg: number | null;
  action: "increase" | "hold" | "decrease" | "start";
  reason: string;
  lastWeightKg: number | null;
  lastReps: (number | null)[];
}

/** Redondea a un múltiplo del incremento disponible. */
export const roundToIncrement = (kg: number, inc: number) => (inc > 0 ? Math.round(kg / inc) * inc : kg);

export function suggestNext(
  lastSets: SetLike[],
  target: { repsMin: number; repsMax: number; rir: number },
  incrementKg: number,
): Suggestion {
  const work = lastSets.filter((s) => s.completed && !s.isWarmup && s.reps != null);
  if (!work.length) {
    return { weightKg: null, action: "start", reason: "Sin registro previo: elige un peso que te deje 2–3 repeticiones en recámara.", lastWeightKg: null, lastReps: [] };
  }
  const weights = work.map((s) => s.weightKg ?? 0);
  const top = Math.max(...weights);
  const lastReps = work.map((s) => s.reps ?? null);
  const atTop = work.every((s) => (s.reps ?? 0) >= target.repsMax);
  const rirOk = work.every((s) => s.rir == null || s.rir >= Math.max(0, target.rir - 1));
  const belowMin = work.filter((s) => (s.reps ?? 0) < target.repsMin).length;

  if (incrementKg <= 0) {
    return atTop
      ? { weightKg: top || null, action: "increase", reason: `Llegaste a ${target.repsMax} reps en todas las series: añade repeticiones, una variante más difícil o lastre.`, lastWeightKg: top || null, lastReps }
      : { weightKg: top || null, action: "hold", reason: "Mantén y busca sumar repeticiones dentro del rango.", lastWeightKg: top || null, lastReps };
  }
  if (atTop && rirOk) {
    const next = roundToIncrement(top + incrementKg, incrementKg);
    return { weightKg: next, action: "increase", reason: `Todas las series en ${target.repsMax}+ reps con recámara suficiente → +${incrementKg} kg.`, lastWeightKg: top, lastReps };
  }
  if (atTop && !rirOk) {
    return { weightKg: top, action: "hold", reason: "Llegaste al máximo de reps pero muy cerca del fallo: consolida este peso.", lastWeightKg: top, lastReps };
  }
  if (belowMin >= Math.ceil(work.length / 2)) {
    return { weightKg: top, action: "hold", reason: `Varias series por debajo de ${target.repsMin} reps: mantén el peso (si se repite, valora bajarlo ~5–10 %).`, lastWeightKg: top, lastReps };
  }
  return { weightKg: top, action: "hold", reason: `Mantén ${top} kg hasta completar ${target.repsMax} reps en todas las series.`, lastWeightKg: top, lastReps };
}

/** 1RM estimado (Epley). SOLO estimación: imprecisa por encima de ~10 reps. */
export function estimate1RM(weightKg: number, reps: number, rir = 0): number | null {
  if (!weightKg || !reps || reps < 1) return null;
  const effective = reps + Math.max(0, rir);
  if (effective > 15) return null;
  return weightKg * (1 + effective / 30);
}

export interface SessionSummary {
  date: string;
  sessionId: string;
  topWeight: number;
  volume: number; // Σ reps × kg (series de trabajo completadas)
  best1RM: number | null;
}

export function summarizeByExercise(
  sets: Pick<ExerciseSet, "sessionId" | "exerciseId" | "weightKg" | "reps" | "rir" | "completed" | "isWarmup">[],
  sessionDates: Record<string, string>,
): Record<string, SessionSummary[]> {
  const out: Record<string, Record<string, SessionSummary>> = {};
  for (const s of sets) {
    if (!s.completed || s.isWarmup || !sessionDates[s.sessionId]) continue;
    const byS = (out[s.exerciseId] ??= {});
    const sum = (byS[s.sessionId] ??= { date: sessionDates[s.sessionId], sessionId: s.sessionId, topWeight: 0, volume: 0, best1RM: null });
    const w = s.weightKg ?? 0;
    const r = s.reps ?? 0;
    sum.topWeight = Math.max(sum.topWeight, w);
    sum.volume += w * r;
    const e = estimate1RM(w, r, s.rir ?? 0);
    if (e != null) sum.best1RM = Math.max(sum.best1RM ?? 0, e);
  }
  return Object.fromEntries(
    Object.entries(out).map(([k, v]) => [k, Object.values(v).sort((a, b) => a.date.localeCompare(b.date))]),
  );
}

/**
 * Estancamiento ORIENTATIVO: en las últimas `window` sesiones el mejor e1RM no supera al de antes.
 */
export function detectPlateau(history: SessionSummary[], window = 3): { plateau: boolean; detail: string } {
  const withE = history.filter((h) => h.best1RM != null);
  if (withE.length < window + 1) return { plateau: false, detail: "Datos insuficientes" };
  const recent = withE.slice(-window);
  const before = withE.slice(0, -window);
  const bestBefore = Math.max(...before.map((h) => h.best1RM!));
  const bestRecent = Math.max(...recent.map((h) => h.best1RM!));
  const plateau = bestRecent <= bestBefore * 1.005;
  return {
    plateau,
    detail: plateau
      ? `Sin mejora del 1RM estimado en ${window} sesiones. Revisa sueño, recuperación o cambia el rango de reps.`
      : "Progresando",
  };
}

/** Series semanales por músculo: principal = 1, secundario = 0,5. */
export function weeklyVolumeByMuscle(
  sets: { exerciseId: string; completed: boolean; isWarmup: boolean }[],
  lookup: (id: string) => Pick<LibraryExercise, "primary" | "secondary"> | undefined,
): Record<MuscleId, number> {
  const v = {} as Record<MuscleId, number>;
  for (const s of sets) {
    if (!s.completed || s.isWarmup) continue;
    const ex = lookup(s.exerciseId);
    if (!ex) continue;
    ex.primary.forEach((m) => (v[m] = (v[m] ?? 0) + 1));
    ex.secondary.forEach((m) => (v[m] = (v[m] ?? 0) + 0.5));
  }
  return v;
}

/** Ajuste de prescripción en descarga (deload) o adaptación. */
export function adjustPrescription(
  sets: number,
  rir: number,
  mode: { deload?: boolean; adaptation?: boolean },
): { sets: number; rir: number; loadFactor: number } {
  if (mode.deload) return { sets: Math.max(1, Math.ceil(sets / 2)), rir: rir + 2, loadFactor: 0.9 };
  if (mode.adaptation) return { sets: Math.min(2, sets), rir: Math.max(rir, 3), loadFactor: 1 };
  return { sets, rir, loadFactor: 1 };
}

/** ¿Toca semana de descarga según la frecuencia configurada? (semana n desde el inicio). */
export function isDeloadWeek(weekIndex: number, every?: number | null): boolean {
  return !!every && every >= 3 && weekIndex > 0 && (weekIndex + 1) % every === 0;
}
