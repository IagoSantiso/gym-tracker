/**
 * Cálculo nutricional DETERMINISTA por ingrediente, receta y ración.
 * - Si un nutriente falta en algún alimento, se marca en `missing` (no se inventa).
 * - Hidratos DISPONIBLES = dato disponible si existe; si la fuente da totales (USDA) = totales − fibra.
 * - Redondeo de presentación según la guía de la Comisión Europea (Reg. 1169/2011, tolerancias 2012).
 */
import type { Food, NutrientTotals, NutrientsPer100, RecipeIngredientData } from "@/lib/db/types";

export type FoodLike = Pick<Food, "id" | "name" | "per100" | "carbBasis" | "state" | "yieldFactor" | "rawFoodId" | "allergens" | "section" | "unitWeights">;

export const EMPTY_TOTALS = (): NutrientTotals => ({
  kcal: 0, proteinG: 0, carbsAvailableG: 0, fiberG: 0, fatG: 0, satFatG: 0, sugarsG: 0, saltG: 0, missing: [],
});

export function availableCarbsPer100(p: NutrientsPer100, basis: Food["carbBasis"]): number | null {
  if (p.carbsAvailableG != null) return p.carbsAvailableG;
  if (basis === "total" && p.carbsTotalG != null && p.fiberG != null) return Math.max(0, p.carbsTotalG - p.fiberG);
  if (basis === "available" && p.carbsTotalG != null) return p.carbsTotalG;
  return null;
}

const FIELDS: [keyof Omit<NutrientTotals, "missing">, (p: NutrientsPer100, f: FoodLike) => number | null][] = [
  ["kcal", (p) => p.kcal],
  ["proteinG", (p) => p.proteinG],
  ["carbsAvailableG", (p, f) => availableCarbsPer100(p, f.carbBasis)],
  ["fiberG", (p) => p.fiberG],
  ["fatG", (p) => p.fatG],
  ["satFatG", (p) => p.satFatG],
  ["sugarsG", (p) => p.sugarsG],
  ["saltG", (p) => p.saltG],
];

export function nutrientsFor(food: FoodLike, grams: number): NutrientTotals {
  const t = EMPTY_TOTALS();
  const k = grams / 100;
  for (const [field, get] of FIELDS) {
    const v = get(food.per100, food);
    if (v == null) t.missing.push(`${field}:${food.name}`);
    else t[field] = v * k;
  }
  return t;
}

export function addTotals(a: NutrientTotals, b: NutrientTotals): NutrientTotals {
  const out = EMPTY_TOTALS();
  for (const [f] of FIELDS) out[f] = a[f] + b[f];
  out.missing = [...new Set([...a.missing, ...b.missing])];
  return out;
}

export function scaleTotals(t: NutrientTotals, k: number): NutrientTotals {
  const out = { ...t, missing: [...t.missing] };
  for (const [f] of FIELDS) out[f] = t[f] * k;
  return out;
}

export interface IngredientLine extends RecipeIngredientData {
  food?: FoodLike;
  totals: NutrientTotals;
}

/** Totales de una receta para `servings` raciones (la receta base es de `baseServings`). */
export function recipeNutrition(
  ingredients: RecipeIngredientData[],
  foods: (id: string) => FoodLike | undefined,
  servings = 1,
  baseServings = 1,
): { lines: IngredientLine[]; totals: NutrientTotals } {
  const k = servings / baseServings;
  let totals = EMPTY_TOTALS();
  const lines = ingredients.map((ing) => {
    const food = foods(ing.foodId);
    const grams = ing.grams * k;
    const t = food ? nutrientsFor(food, grams) : { ...EMPTY_TOTALS(), missing: [`*:${ing.foodId}`] };
    totals = addTotals(totals, t);
    return { ...ing, grams, food, totals: t };
  });
  return { lines, totals };
}

/** Peso cocinado a partir del crudo con el factor de rendimiento (cocido/crudo). */
export const cookedFromRaw = (rawG: number, yieldFactor: number) => rawG * yieldFactor;
/** Peso crudo necesario para obtener un peso cocinado. */
export const rawFromCooked = (cookedG: number, yieldFactor: number) => (yieldFactor > 0 ? cookedG / yieldFactor : cookedG);

/** Redondeo de presentación (orientación UE). */
export function fmtNutrient(field: keyof Omit<NutrientTotals, "missing">, v: number): string {
  if (field === "kcal") return String(Math.round(v));
  if (field === "saltG") return v < 0.0125 ? "0" : v < 1 ? v.toFixed(2).replace(".", ",") : v.toFixed(1).replace(".", ",");
  if (v < 0.5 && (field === "fiberG" || field === "satFatG" || field === "sugarsG" || field === "fatG" || field === "proteinG" || field === "carbsAvailableG")) return v < 0.05 ? "0" : "<0,5";
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(".", ",");
}

/**
 * Indicador cualitativo (NO predictivo): fibra/grasa/proteína elevadas pueden ralentizar la
 * absorción de hidratos, pero la respuesta glucémica individual varía.
 */
export function absorptionHint(t: NutrientTotals): string | null {
  if (t.carbsAvailableG < 10) return null;
  const reasons: string[] = [];
  if (t.fiberG >= 8) reasons.push("fibra alta");
  if (t.fatG >= 20) reasons.push("grasa alta");
  if (t.proteinG >= 35) reasons.push("proteína alta");
  return reasons.length ? `Posible absorción más lenta (${reasons.join(", ")}); orientativo, tu respuesta puede variar.` : null;
}

export function allergensOf(ingredients: RecipeIngredientData[], foods: (id: string) => FoodLike | undefined): string[] {
  return [...new Set(ingredients.flatMap((i) => foods(i.foodId)?.allergens ?? []))];
}
