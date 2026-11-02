/**
 * Balance nutricional del día y reajuste del RESTO del día (determinista, puro).
 *
 * Reglas de seguridad (ver docs/SAFETY_AND_PRIVACY.md y D25):
 *  - Nunca se propone saltarse comidas ni bajar de un mínimo energético razonable.
 *  - La compensación con actividad (suave y acotada) vive en energy.ts; aquí solo comidas.
 *  - Por defecto se mantienen los hidratos de cada comida (± tolerancia): en diabetes tipo 1
 *    un cambio de hidratos puede afectar a la glucosa y a lo pautado por el equipo sanitario.
 *    Si una opción los cambia, se marca para que la persona lo revise con su protocolo.
 *  - Los valores son orientativos (bases de datos de referencia y estimaciones).
 */
import type { MealSlot, NutrientTotals } from "@/lib/db/types";
import { EMPTY_TOTALS, addTotals, recipeNutrition, type FoodLike } from "./calc";
import type { RecipeLike } from "./menu";

export type Range = [number, number];

export interface DayTargets {
  kcal: Range | null;
  proteinG: Range | null;
  /** g de grasa/día; si no hay pauta se deriva del 25–35 % de la energía */
  fatG: Range | null;
  /** hidratos pautados del día (si existen) */
  carbsG: number | null;
  fiberG: number;
}

/** Rango de grasa: pauta manual (±10 %) o 25–35 % de la energía del rango. */
export function fatRange(kcal: Range | null, manualFatG?: number | null): Range | null {
  if (manualFatG && manualFatG > 0) return [Math.round(manualFatG * 0.9), Math.round(manualFatG * 1.1)];
  if (!kcal) return null;
  return [Math.round((kcal[0] * 0.25) / 9), Math.round((kcal[1] * 0.35) / 9)];
}

export type Status = "low" | "ok" | "high" | "unknown";

export interface NutrientBalance {
  key: "kcal" | "proteinG" | "fatG" | "carbsAvailableG" | "fiberG";
  label: string;
  unit: string;
  consumed: number;
  planned: number;
  projected: number;
  target: Range | null;
  /** lo que queda hasta el rango (lo..hi) después de lo ya comido */
  remaining: Range | null;
  status: Status;
}

export interface DayBalance {
  consumed: NutrientTotals;
  plannedRest: NutrientTotals;
  projected: NutrientTotals;
  nutrients: NutrientBalance[];
  messages: string[];
  hasEstimates: boolean;
}

export interface RemainingMeal {
  id: string;
  slot: MealSlot;
  recipe: RecipeLike;
  servings: number;
}

const LABELS: Record<NutrientBalance["key"], [string, string]> = {
  kcal: ["Energía", "kcal"],
  proteinG: ["Proteína", "g"],
  fatG: ["Grasa", "g"],
  carbsAvailableG: ["Hidratos disp.", "g"],
  fiberG: ["Fibra", "g"],
};

const statusOf = (v: number, r: Range | null): Status => (!r ? "unknown" : v < r[0] ? "low" : v > r[1] ? "high" : "ok");
const r0 = (n: number) => Math.round(n);

export function mealTotals(m: RemainingMeal, foods: (id: string) => FoodLike | undefined): NutrientTotals {
  return recipeNutrition(m.recipe.ingredients, foods, m.servings, m.recipe.servings).totals;
}

export function dayBalance(
  consumedList: NutrientTotals[],
  remaining: RemainingMeal[],
  foods: (id: string) => FoodLike | undefined,
  t: DayTargets,
  opts: { hasEstimates?: boolean } = {},
): DayBalance {
  const consumed = consumedList.reduce(addTotals, EMPTY_TOTALS());
  const plannedRest = remaining.map((m) => mealTotals(m, foods)).reduce(addTotals, EMPTY_TOTALS());
  const projected = addTotals(consumed, plannedRest);
  const targetOf: Record<NutrientBalance["key"], Range | null> = {
    kcal: t.kcal,
    proteinG: t.proteinG,
    fatG: t.fatG,
    carbsAvailableG: t.carbsG != null ? [t.carbsG, t.carbsG] : null,
    fiberG: [t.fiberG, Number.POSITIVE_INFINITY],
  };
  const nutrients: NutrientBalance[] = (Object.keys(LABELS) as NutrientBalance["key"][]).map((key) => {
    const target = targetOf[key];
    const c = consumed[key];
    return {
      key, label: LABELS[key][0], unit: LABELS[key][1], consumed: c, planned: plannedRest[key], projected: projected[key], target,
      remaining: target ? [Math.max(0, target[0] - c), Math.max(0, target[1] - c)] : null,
      status: statusOf(projected[key], target),
    };
  });
  const messages: string[] = [];
  const by = (k: NutrientBalance["key"]) => nutrients.find((n) => n.key === k)!;
  const fat = by("fatG");
  const kcal = by("kcal");
  const prot = by("proteinG");
  if (fat.target && fat.consumed > fat.target[1]) {
    messages.push(`Ya llevas ${r0(fat.consumed)} g de grasa, por encima de tu rango del día (${fat.target[0]}–${fat.target[1]} g). No pasa nada por un día: elige lo que queda con poca grasa (cocina a la plancha, menos aceite, proteína magra) y sin saltarte comidas.`);
  } else if (fat.status === "high" && fat.target) {
    const extra = r0(fat.projected - fat.target[1]);
    messages.push(`Con lo que queda previsto acabarías unos ${extra} g por encima de tu rango de grasa (${fat.target[0]}–${fat.target[1]} g). Puedes elegir para ${remaining.length > 1 ? "las próximas comidas" : "la próxima comida"} una opción con menos grasa.`);
  }
  if (kcal.target && kcal.status === "high") {
    messages.push(`La previsión del día queda en ~${r0(kcal.projected)} kcal (rango ${kcal.target[0]}–${kcal.target[1]}). Un ajuste moderado en lo que queda basta, sin saltarte comidas.`);
  } else if (kcal.target && kcal.status === "low" && remaining.length) {
    messages.push(`La previsión queda por debajo de tu rango energético (~${r0(kcal.projected)} de ${kcal.target[0]}–${kcal.target[1]} kcal). Mejor no quedarse corto: mantén las comidas que quedan.`);
  }
  if (prot.target && prot.status === "low") {
    messages.push(`Proteína prevista ~${r0(prot.projected)} g (rango ${prot.target[0]}–${prot.target[1]} g): prioriza una fuente de proteína en lo que queda.`);
  }
  if (!messages.length && consumedList.length) messages.push("Vas dentro de lo previsto. Sigue con el menú del resto del día.");
  return { consumed, plannedRest, projected, nutrients, messages, hasEstimates: !!opts.hasEstimates };
}

export interface RebalanceOption {
  mealId: string;
  slot: MealSlot;
  recipe: RecipeLike;
  servings: number;
  totals: NutrientTotals;
  /** cambio de hidratos respecto a la comida prevista (g) */
  dCarbs: number;
  carbsChanged: boolean;
  /** mejora de la previsión del día (mayor = mejor) */
  gain: number;
  why: string;
}

/** Distancia de la previsión del día a los rangos (0 = todo dentro). */
function distance(p: NutrientTotals, t: DayTargets): number {
  const d = (v: number, r: Range | null, scale: number) => (!r ? 0 : v < r[0] ? (r[0] - v) / scale : v > r[1] ? (v - r[1]) / scale : 0);
  return d(p.kcal, t.kcal, 100) + d(p.fatG, t.fatG, 8) + d(p.proteinG, t.proteinG, 15);
}

/**
 * Opciones para reajustar el resto del día: sustituir una comida que queda por otra receta
 * (mismo hueco) o ajustar raciones, priorizando mantener los hidratos de esa comida.
 * Nunca propone eliminar comidas ni raciones < 0,75.
 */
export function rebalanceOptions(
  consumedList: NutrientTotals[],
  remaining: RemainingMeal[],
  pool: RecipeLike[],
  foods: (id: string) => FoodLike | undefined,
  t: DayTargets,
  opts: { carbTolerance?: number; max?: number } = {},
): RebalanceOption[] {
  const tol = opts.carbTolerance ?? 10;
  const base = dayBalance(consumedList, remaining, foods, t);
  const baseDist = distance(base.projected, t);
  if (baseDist === 0) return [];
  const out: RebalanceOption[] = [];
  for (const m of remaining) {
    const cur = mealTotals(m, foods);
    const others = remaining.filter((x) => x.id !== m.id);
    const tryCandidate = (recipe: RecipeLike, servings: number) => {
      const tot = recipeNutrition(recipe.ingredients, foods, servings, recipe.servings).totals;
      if (tot.missing.some((x) => x.startsWith("*:"))) return;
      const proj = addTotals(dayBalance(consumedList, others, foods, t).projected, tot);
      const gain = baseDist - distance(proj, t);
      if (gain <= 0.05) return;
      const dCarbs = tot.carbsAvailableG - cur.carbsAvailableG;
      const parts: string[] = [];
      if (Math.abs(tot.fatG - cur.fatG) >= 3) parts.push(`${tot.fatG < cur.fatG ? "−" : "+"}${r0(Math.abs(tot.fatG - cur.fatG))} g grasa`);
      if (Math.abs(tot.kcal - cur.kcal) >= 30) parts.push(`${tot.kcal < cur.kcal ? "−" : "+"}${r0(Math.abs(tot.kcal - cur.kcal))} kcal`);
      if (Math.abs(tot.proteinG - cur.proteinG) >= 3) parts.push(`${tot.proteinG < cur.proteinG ? "−" : "+"}${r0(Math.abs(tot.proteinG - cur.proteinG))} g proteína`);
      out.push({
        mealId: m.id, slot: m.slot, recipe, servings, totals: tot, dCarbs, carbsChanged: Math.abs(dCarbs) > tol, gain,
        why: parts.length ? parts.join(", ") : "acerca el día a tus rangos",
      });
    };
    for (const r of pool) if (r.id !== m.recipe.id && r.slots.includes(m.slot)) tryCandidate(r, 1);
    for (const s of [0.75, 1.25]) if (s !== m.servings) tryCandidate(m.recipe, s);
  }
  return out
    .sort((a, b) => Number(a.carbsChanged) - Number(b.carbsChanged) || b.gain - a.gain || a.recipe.id.localeCompare(b.recipe.id))
    .slice(0, opts.max ?? 5);
}
