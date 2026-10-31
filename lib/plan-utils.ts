import type { PlanItem, PlanMode, SetsState } from "./types";

export const exerciseKey = (item: Pick<PlanItem, "id">, mode: PlanMode, day: number) =>
  `${mode}-${day}-${item.id}`;

/** En modo adaptación el máximo es de 2 series por ejercicio. */
export const setsFor = (item: PlanItem, adapt: boolean) =>
  adapt ? Math.min(2, item.sets) : item.sets;

export const doneSetsOf = (item: PlanItem, key: string, sets: SetsState, adapt: boolean) =>
  (sets[key] ?? []).slice(0, setsFor(item, adapt)).filter(Boolean).length;

export const isExerciseDone = (item: PlanItem, key: string, sets: SetsState, adapt: boolean) =>
  doneSetsOf(item, key, sets, adapt) >= setsFor(item, adapt);

/** Lunes 00:00 de la semana en curso (ms). */
export function weekStart(now = new Date()): number {
  const offset = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset).getTime();
}

export const formatLogDate = (d = new Date()) =>
  d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
