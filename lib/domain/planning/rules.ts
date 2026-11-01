/**
 * Motor de reglas DETERMINISTA y auditable para el plan semanal.
 * Errores = restricciones duras (el generador nunca las viola); avisos = revisar.
 */
import type { Intensity, PlannedItemData } from "@/lib/db/types";
import { addDays, daysBetween } from "@/lib/domain/time";

export interface Violation {
  rule: string;
  severity: "error" | "warn";
  dates: string[];
  message: string;
}

export type PlanItemLike = Pick<PlannedItemData, "date" | "kind" | "intensity" | "durationMin" | "title" | "loadsLegs"> & {
  id?: string;
  status?: string;
};

const live = (i: PlanItemLike) => i.status !== "cancelled" && i.kind !== "rest";
export const isHard = (i: PlanItemLike) => live(i) && i.intensity === "hard";

export const RULES = {
  R1: "No dos días duros consecutivos",
  R2: "Al menos un día de descanso por semana",
  R3: "Evitar fuerza de piernas el día antes de una sesión dura de carrera/bici",
  R4: "La duración prevista cabe en tu disponibilidad",
  R5: "No más de 2 sesiones duras en 3 días",
  R6: "Subida de carga semanal prudente",
} as const;

export function validateWeek(
  items: PlanItemLike[],
  ctx: { weekStart: string; availability?: Record<number, number>; prevWeekHardLastDay?: boolean; prevWeekMinutes?: number },
): Violation[] {
  const v: Violation[] = [];
  const days = Array.from({ length: 7 }, (_, i) => addDays(ctx.weekStart, i));
  const byDay = (d: string) => items.filter((i) => i.date === d && live(i));
  const hardDay = (d: string) => byDay(d).some(isHard);

  // R1
  days.forEach((d, i) => {
    const prevHard = i === 0 ? !!ctx.prevWeekHardLastDay : hardDay(days[i - 1]);
    if (hardDay(d) && prevHard) {
      v.push({ rule: "R1", severity: "error", dates: [i === 0 ? addDays(d, -1) : days[i - 1], d], message: `${RULES.R1}: ${i === 0 ? "domingo anterior" : days[i - 1]} y ${d}.` });
    }
  });
  // R2
  const restDays = days.filter((d) => byDay(d).length === 0 || byDay(d).every((i) => i.intensity === "rest"));
  if (!restDays.length) v.push({ rule: "R2", severity: "error", dates: [], message: RULES.R2 + "." });
  // R3
  days.forEach((d, i) => {
    if (i === 6) return;
    const legs = byDay(d).some((x) => x.kind === "strength" && x.loadsLegs);
    const nextHardCardio = byDay(days[i + 1]).some((x) => (x.kind === "run" || x.kind === "bike") && isHard(x));
    if (legs && nextHardCardio) v.push({ rule: "R3", severity: "warn", dates: [d, days[i + 1]], message: `${RULES.R3} (${d}).` });
  });
  // R4
  if (ctx.availability) {
    days.forEach((d, i) => {
      const total = byDay(d).reduce((a, x) => a + x.durationMin, 0);
      const avail = ctx.availability![i] ?? 0;
      if (total > avail + 5) v.push({ rule: "R4", severity: "warn", dates: [d], message: `${RULES.R4}: ${total} min previstos y ${avail} disponibles el ${d}.` });
    });
  }
  // R5
  for (let i = 0; i <= 4; i++) {
    const n = [0, 1, 2].filter((k) => hardDay(days[i + k])).length;
    if (n > 2) v.push({ rule: "R5", severity: "error", dates: days.slice(i, i + 3), message: `${RULES.R5} (${days[i]}–${days[i + 2]}).` });
  }
  // R6
  if (ctx.prevWeekMinutes && ctx.prevWeekMinutes > 0) {
    const total = items.filter(live).reduce((a, x) => a + x.durationMin, 0);
    if (total > ctx.prevWeekMinutes * 1.3) {
      v.push({ rule: "R6", severity: "warn", dates: [], message: `${RULES.R6}: ${total} min frente a ${ctx.prevWeekMinutes} la semana pasada (+${Math.round((total / ctx.prevWeekMinutes - 1) * 100)} %).` });
    }
  }
  return v;
}

export const hasErrors = (v: Violation[]) => v.some((x) => x.severity === "error");

export function intensityRank(i: Intensity) {
  return { rest: 0, easy: 1, moderate: 2, hard: 3 }[i];
}

export function inWeek(date: string, weekStart: string) {
  const d = daysBetween(weekStart, date);
  return d >= 0 && d < 7;
}
