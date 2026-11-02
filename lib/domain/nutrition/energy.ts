/**
 * Balance energético del día (consumido vs. gastado ESTIMADO) y compensación ACOTADA con
 * actividad suave. Puro y determinista.
 *
 * Gasto estimado del día = base (BMR × 1,2: reposo + digestión + vida diaria mínima)
 *   + pasos por encima de 5000 (≈ 0,0005 kcal/paso/kg)
 *   + ejercicio registrado (MET netos × kg × horas, o por velocidad/inclinación en cinta).
 * Error esperable ±10–15 %: se muestra como estimación.
 *
 * Compensación (D34): si la previsión del día supera el objetivo, se puede proponer cubrir
 * como mucho `maxPct` % del exceso (tope 50 %) con actividad SUAVE (caminar con inclinación o
 * trote suave en Z1–Z2), entre 10 y 30 min. El resto se ajusta con lo que queda por comer.
 * Nunca intensidad alta, nunca más de 30 min, nunca si el día ya tiene una sesión dura,
 * nunca saltarse comidas. Con diabetes tipo 1 se recuerda seguir el protocolo de ejercicio
 * del equipo sanitario; la app no da indicaciones de insulina ni de hidratos para corregir.
 */
import type { EnduranceSession, Sport } from "@/lib/db/types";

export interface ExerciseToday {
  label: string;
  kcal: number;
}

/** MET brutos por deporte e intensidad (Compendium of Physical Activities 2011/2024, aprox.). */
const MET: Record<Sport, [number, number, number]> = {
  // [suave, moderado, duro]
  run: [7, 9, 11],
  treadmill: [5, 8, 10],
  bike: [5, 7, 10],
  walk: [3.5, 4.3, 5],
  mobility: [2.5, 3, 3.5],
  swim: [6, 8, 10],
  other: [4, 5, 7],
};

const level = (rpe?: number | null): 0 | 1 | 2 => (rpe == null ? 1 : rpe <= 4 ? 0 : rpe <= 7 ? 1 : 2);

/** MET de cinta por velocidad (km/h) e inclinación (%) — ACSM simplificado. */
export function treadmillMet(speedKmh: number, inclinePct = 0): number {
  const v = (speedKmh * 1000) / 60; // m/min
  const g = inclinePct / 100;
  const vo2 = speedKmh >= 7 ? 0.2 * v + 0.9 * v * g + 3.5 : 0.1 * v + 1.8 * v * g + 3.5;
  return vo2 / 3.5;
}

/** kcal netas (por encima del reposo) de una sesión de resistencia. */
export function enduranceKcal(s: Pick<EnduranceSession, "sport" | "durationSec" | "rpe" | "treadmillSpeedKmh" | "treadmillInclinePct" | "whileWorking">, kg: number): number {
  const h = s.durationSec / 3600;
  let met = MET[s.sport]?.[level(s.rpe)] ?? 4;
  if ((s.sport === "treadmill" || s.sport === "walk") && s.treadmillSpeedKmh) met = treadmillMet(s.treadmillSpeedKmh, s.treadmillInclinePct ?? 0);
  // Cinta de escritorio: también suma. Con velocidad, la fórmula ya refleja el ritmo bajo;
  // sin velocidad, se asume paseo lento (~2,5 km/h ≈ 2,5 MET).
  else if (s.whileWorking) met = 2.5;
  return Math.max(0, (met - 1) * kg * h);
}

/** kcal netas de una sesión de fuerza (MET ~5 con descansos). */
export const strengthKcal = (minutes: number, kg: number) => Math.max(0, (5 - 1) * kg * (minutes / 60));

/** Pasos aproximados de una sesión a pie (para no contarlos dos veces si el reloj ya suma pasos del día). */
export function sessionSteps(s: Pick<EnduranceSession, "sport" | "durationSec" | "distanceM" | "treadmillSpeedKmh" | "steps">): number {
  if (s.steps) return s.steps;
  if (!["walk", "treadmill", "run"].includes(s.sport)) return 0;
  const km = s.distanceM ? s.distanceM / 1000 : s.treadmillSpeedKmh ? (s.treadmillSpeedKmh * s.durationSec) / 3600 : 0;
  return Math.round(km * (s.sport === "run" || (s.treadmillSpeedKmh ?? 0) >= 7 ? 1000 : 1300));
}

export interface EnergyDayInput {
  weightKg: number | null;
  bmrMid: number | null;
  steps: number | null;
  exercise: ExerciseToday[];
  intakeKcal: number;
  plannedRestKcal: number;
  /** déficit diario buscado por el objetivo (0 = mantenimiento) */
  targetDeficit: number;
}

export type DayVerdict = "on_track" | "over" | "under" | "unknown";

export interface EnergyDay {
  ok: boolean;
  base: number;
  steps: number;
  exercise: number;
  spent: number;
  intake: number;
  projectedIntake: number;
  /** consumido − gastado (negativo = déficit) */
  balance: number;
  projectedBalance: number;
  targetBalance: number;
  verdict: DayVerdict;
  /** kcal por encima del objetivo en la previsión del día (0 si no hay exceso) */
  excess: number;
  message: string;
}

const r10 = (n: number) => Math.round(n / 10) * 10;

export function energyDay(i: EnergyDayInput): EnergyDay {
  if (!i.weightKg || !i.bmrMid) {
    return { ok: false, base: 0, steps: 0, exercise: 0, spent: 0, intake: i.intakeKcal, projectedIntake: i.intakeKcal + i.plannedRestKcal, balance: 0, projectedBalance: 0, targetBalance: 0, verdict: "unknown", excess: 0, message: "Para estimar el gasto completa peso, altura y fecha de nacimiento en Ajustes." };
  }
  const base = i.bmrMid * 1.2;
  const steps = i.steps && i.steps > 5000 ? (i.steps - 5000) * i.weightKg * 0.0005 : 0;
  const exercise = i.exercise.reduce((a, e) => a + e.kcal, 0);
  const spent = base + steps + exercise;
  const projectedIntake = i.intakeKcal + i.plannedRestKcal;
  const balance = i.intakeKcal - spent;
  const projectedBalance = projectedIntake - spent;
  const targetBalance = -Math.max(0, i.targetDeficit);
  const tol = 200;
  const verdict: DayVerdict = projectedBalance > targetBalance + tol ? "over" : projectedBalance < targetBalance - 500 ? "under" : "on_track";
  const excess = Math.max(0, projectedBalance - targetBalance - tol / 2);
  const message =
    verdict === "on_track" ? (i.targetDeficit > 0 ? `Vas en objetivo: déficit previsto de ~${r10(-projectedBalance)} kcal (buscado ~${r10(i.targetDeficit)}).` : "Vas en objetivo para mantener.")
    : verdict === "over" ? `La previsión del día queda ~${r10(projectedBalance - targetBalance)} kcal por encima de tu objetivo.`
    : `La previsión queda muy por debajo de lo que necesitas (~${r10(targetBalance - projectedBalance)} kcal): no te quedes corto, mantén las comidas que quedan.`;
  return { ok: true, base: r10(base), steps: r10(steps), exercise: r10(exercise), spent: r10(spent), intake: Math.round(i.intakeKcal), projectedIntake: Math.round(projectedIntake), balance: r10(balance), projectedBalance: r10(projectedBalance), targetBalance: r10(targetBalance), verdict, excess: r10(excess), message };
}

export interface CompensationOption {
  /** kcal que se proponen cubrir con actividad */
  kcal: number;
  /** % del exceso que supone */
  pct: number;
  activities: { label: string; sport: Sport; minutes: number; speedKmh: number; inclinePct: number }[];
  /** kcal del exceso que quedan para ajustar con las comidas */
  restForMeals: number;
  notes: string[];
}

export interface CompensationContext {
  excess: number;
  weightKg: number;
  maxPct: number;
  /** ¿ya hay hoy una sesión dura hecha o prevista? */
  hardSessionToday: boolean;
  /** minutos de ejercicio ya hechos hoy */
  exerciseMinToday: number;
  hasDiabetes: boolean;
}

export const COMPENSATION_LIMITS = { maxPct: 50, minMin: 10, maxMin: 30, minExcess: 150 } as const;

/** Propuesta de compensación acotada, o null si no procede. */
export function compensationOption(c: CompensationContext): CompensationOption | null {
  const maxPct = Math.max(0, Math.min(COMPENSATION_LIMITS.maxPct, c.maxPct));
  if (!maxPct || c.excess < COMPENSATION_LIMITS.minExcess || !c.weightKg) return null;
  if (c.exerciseMinToday >= 90) return null; // ya hay mucha actividad hoy
  const target = (c.excess * maxPct) / 100;
  const opts = [
    { label: "Caminar en cinta con inclinación", sport: "treadmill" as Sport, speedKmh: 5.5, inclinePct: 6 },
    ...(c.hardSessionToday ? [] : [{ label: "Trote suave en cinta (Z1–Z2, puedes hablar)", sport: "treadmill" as Sport, speedKmh: 8, inclinePct: 1 }]),
  ];
  const activities = opts.map((o) => {
    const netPerMin = ((treadmillMet(o.speedKmh, o.inclinePct) - 1) * c.weightKg) / 60;
    const minutes = Math.round(Math.min(COMPENSATION_LIMITS.maxMin, Math.max(COMPENSATION_LIMITS.minMin, target / netPerMin)) / 5) * 5;
    return { ...o, minutes };
  });
  // kcal realmente cubiertas con la primera opción (respetando el tope de minutos)
  const first = activities[0];
  const covered = Math.min(target, ((treadmillMet(first.speedKmh, first.inclinePct) - 1) * c.weightKg / 60) * first.minutes);
  const notes = [
    "Intensidad suave: deberías poder hablar. No conviertas la compensación en una sesión dura.",
    "Es una estimación: no hace falta cuadrar el día al detalle; la tendencia semanal es lo que cuenta.",
  ];
  if (c.hardSessionToday) notes.push("Hoy ya tienes una sesión exigente: solo se propone caminar.");
  if (c.hasDiabetes) notes.push("Con diabetes tipo 1, sigue tu protocolo de ejercicio (comprobar glucosa antes y llevar hidratos según tu plan). La app no da indicaciones de insulina.");
  return { kcal: r10(covered), pct: Math.round((covered / c.excess) * 100), activities, restForMeals: r10(Math.max(0, c.excess - covered)), notes };
}
