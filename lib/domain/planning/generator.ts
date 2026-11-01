/**
 * Generador semanal determinista. Respeta: disponibilidad, días bloqueados, descanso,
 * separación de sesiones duras e interferencia piernas → carrera dura.
 */
import type { PlannedItemData, RunSpec, TemplateDay } from "@/lib/db/types";
import { addDays } from "@/lib/domain/time";
import { TYPE_LABEL, isHardType } from "@/lib/domain/training/endurance";
import { hasErrors, validateWeek, type PlanItemLike } from "./rules";

export const GENERATOR_VERSION = "plan-1.0";

export interface PlanInput {
  weekStart: string;
  availability: Record<number, number>;
  template: { id: string; days: TemplateDay[] } | null;
  runSessions: RunSpec[];
  bike: { perWeek: number; minutes: number };
  /** fechas bloqueadas (no se toca lo que haya) */
  lockedItems: PlannedItemData[];
  lockedDays: string[];
  prevWeekHardLastDay?: boolean;
}

const legsFocus = (d: TemplateDay) => ["legs", "lower", "full"].includes(d.focus);
const strengthMinutes = (d: TemplateDay) =>
  Math.min(75, Math.max(35, Math.round(d.items.reduce((a, i) => a + i.sets * (i.restSec + 45), 0) / 60) + 8));

export function generateWeek(input: PlanInput): { items: PlannedItemData[]; notes: string[] } {
  const notes: string[] = [];
  const days = Array.from({ length: 7 }, (_, i) => addDays(input.weekStart, i));
  const items: PlannedItemData[] = [...input.lockedItems];
  const lockedSet = new Set(input.lockedDays);
  const free = (d: string) => !lockedSet.has(d);
  const avail = (i: number) => input.availability[i] ?? 0;
  const used = (d: string) => items.filter((x) => x.date === d && x.kind !== "rest").reduce((a, x) => a + x.durationMin, 0);
  const ok = (cand: PlannedItemData) => {
    const test: PlanItemLike[] = [...items, cand];
    const v = validateWeek(test, { weekStart: input.weekStart, prevWeekHardLastDay: input.prevWeekHardLastDay });
    return !hasErrors(v.filter((x) => x.rule !== "R2"));
  };
  let order = 0;
  const place = (cand: Omit<PlannedItemData, "date" | "sortOrder">, prefer: number[]): boolean => {
    for (const i of prefer) {
      const d = days[i];
      if (!free(d)) continue;
      if (items.some((x) => x.date === d && x.kind !== "rest" && x.kind !== "walk")) continue;
      if (avail(i) - used(d) < Math.min(cand.durationMin, 30)) continue;
      const full: PlannedItemData = { ...cand, date: d, durationMin: Math.min(cand.durationMin, avail(i) - used(d)), sortOrder: order++ };
      if (!ok(full)) continue;
      items.push(full);
      return true;
    }
    return false;
  };

  // Reservar un día de descanso: el de menor disponibilidad (preferiblemente sin bloquear)
  const restIdx = [...days.keys()].filter((i) => free(days[i])).sort((a, b) => avail(a) - avail(b) || a - b)[0];
  const restDay = restIdx != null ? days[restIdx] : null;
  const usable = (arr: number[]) => arr.filter((i) => days[i] !== restDay);

  // 1) Tirada larga en fin de semana
  const runs = [...input.runSessions];
  const longIdx = runs.findIndex((r) => r.type === "long" || r.type === "race");
  if (longIdx >= 0) {
    const r = runs.splice(longIdx, 1)[0];
    const okLong = place(runItem(r), usable([6, 5, 4, 3, 2, 1, 0]));
    if (!okLong) notes.push("No cupo la tirada larga: revisa disponibilidad del fin de semana.");
  }
  // 2) Fuerza separada (patrón L-X-V / M-J-S)
  const tdays = input.template?.days ?? [];
  const patterns = tdays.length >= 3 ? [[0, 2, 4], [1, 3, 5], [0, 3, 5], [0, 2, 5]] : [[1, 4], [0, 3], [2, 5], [0, 4]];
  tdays.forEach((td, k) => {
    const cand: Omit<PlannedItemData, "date" | "sortOrder"> = {
      kind: "strength", title: td.title, intensity: legsFocus(td) ? "hard" : "moderate", durationMin: strengthMinutes(td),
      templateId: input.template!.id, dayIndex: k, loadsLegs: legsFocus(td), runSpec: null, notes: td.subtitle,
    };
    const prefs = patterns.map((p) => p[k]).filter((x) => x != null);
    const rest = [0, 1, 2, 3, 4, 5, 6].filter((x) => !prefs.includes(x));
    if (!place(cand, usable([...prefs, ...rest]))) notes.push(`No cupo la sesión de fuerza "${td.title}".`);
  });
  // 3) Calidad (duras) y luego fáciles
  runs.sort((a, b) => Number(isHardType(b.type)) - Number(isHardType(a.type)));
  for (const r of runs) {
    const prefer = isHardType(r.type) ? [1, 3, 2, 4, 0, 5, 6] : [0, 2, 4, 1, 3, 5, 6];
    if (!place(runItem(r), usable(prefer))) notes.push(`No cupo: ${TYPE_LABEL[r.type]}.`);
  }
  // 4) Bici (resistencia fácil)
  for (let b = 0; b < input.bike.perWeek; b++) {
    const cand: Omit<PlannedItemData, "date" | "sortOrder"> = {
      kind: "bike", title: "Bici · resistencia suave", intensity: "easy", durationMin: input.bike.minutes,
      runSpec: { type: "endurance", durationMin: input.bike.minutes, hrZone: "Z2" }, loadsLegs: false,
    };
    if (!place(cand, usable([5, 6, 2, 4, 0, 1, 3]))) notes.push("No cupo la salida en bici.");
  }
  // 5) Descanso explícito + movilidad opcional
  if (restDay) {
    items.push({ date: restDay, kind: "rest", title: "Descanso", intensity: "rest", durationMin: 0, sortOrder: order++, notes: "Paseo suave o movilidad opcional." });
  }
  return { items: items.sort((a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder), notes };
}

export function runItem(r: RunSpec): Omit<PlannedItemData, "date" | "sortOrder"> {
  return {
    kind: "run", title: `Carrera · ${TYPE_LABEL[r.type]}`, intensity: isHardType(r.type) || r.type === "long" ? "hard" : r.type === "recovery" ? "easy" : "easy",
    durationMin: r.durationMin ?? Math.round((r.distanceKm ?? 5) * 6.5), runSpec: r, loadsLegs: false,
  };
}
