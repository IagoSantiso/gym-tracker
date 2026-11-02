/** Cantidades legibles por ingrediente para una comida (gramos + medidas caseras). */
import type { RecipeIngredientData } from "@/lib/db/types";
import { cookedFromRaw, type FoodLike } from "./calc";

export interface PortionLine {
  foodId: string;
  name: string;
  grams: number;
  /** "120 g", "2 unidades (100 g)", "1 cucharada (10 g)" */
  label: string;
  /** peso cocinado aproximado si el ingrediente se pesa en crudo y tiene rendimiento conocido */
  cookedG: number | null;
  stateNote: string | null;
  note: string | null;
}

const PLURAL: Record<string, string> = { unidad: "unidades", rebanada: "rebanadas", cucharada: "cucharadas", cucharadita: "cucharaditas", lata: "latas", onza: "onzas", diente: "dientes" };

/** Redondeo útil para pesar: <20 g a 1 g, <100 g a 5 g, resto a 10 g. */
export function roundGrams(g: number): number {
  if (g < 20) return Math.max(1, Math.round(g));
  if (g < 100) return Math.round(g / 5) * 5;
  return Math.round(g / 10) * 10;
}

export function portionLabel(grams: number, food?: FoodLike): string {
  const g = roundGrams(grams);
  const unit = food?.unitWeights && Object.entries(food.unitWeights).find(([, w]) => w > 0);
  if (unit) {
    const n = Math.round((grams / unit[1]) * 2) / 2;
    if (n >= 0.5 && Math.abs(n * unit[1] - grams) / grams <= 0.2) {
      const name = n > 1 ? PLURAL[unit[0]] ?? `${unit[0]}s` : unit[0];
      return `${n.toLocaleString("es-ES")} ${name} (${g} g)`;
    }
  }
  return `${g} g`;
}

export function portionLines(
  ingredients: RecipeIngredientData[],
  foods: (id: string) => FoodLike | undefined,
  servings: number,
  baseServings: number,
): PortionLine[] {
  const k = servings / (baseServings || 1);
  return ingredients.map((ing) => {
    const food = foods(ing.foodId);
    const grams = ing.grams * k;
    const cooked = food?.state === "raw" && food.yieldFactor && food.yieldFactor !== 1 ? roundGrams(cookedFromRaw(grams, food.yieldFactor)) : null;
    return {
      foodId: ing.foodId,
      name: food?.name ?? ing.foodId,
      grams,
      label: portionLabel(grams, food),
      cookedG: cooked,
      stateNote: cooked ? "pesado en crudo" : food?.state === "cooked" ? "pesado ya cocinado" : null,
      note: ing.note ?? null,
    };
  });
}
