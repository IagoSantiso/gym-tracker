/**
 * Generador de menús DETERMINISTA (misma entrada → mismo menú).
 * Respeta: alérgenos/intolerancias, alimentos excluidos, lista negra, tiempo de cocina,
 * rotación (no repetir comida/cena en 2 días salvo sobras), favoritos y comidas bloqueadas.
 * Ajusta raciones (0,75–1,5) para acercarse al rango energético si existe; nunca por debajo de 0,75.
 */
import type { MealSlot, NutrientTotals, RecipeIngredientData } from "@/lib/db/types";
import { addDays } from "@/lib/domain/time";
import { allergensOf, recipeNutrition, type FoodLike } from "./calc";

export const MENU_VERSION = "menu-1.0";

export interface RecipeLike {
  id: string;
  name: string;
  slots: MealSlot[];
  prepMin: number;
  cookMin: number;
  batchFriendly: boolean;
  servings: number;
  ingredients: RecipeIngredientData[];
}

export interface MenuConstraints {
  weekStart: string;
  slots: MealSlot[];
  /** fechas con entrenamiento: añaden pre/post si están en `slots` */
  trainingDates: string[];
  excludedAllergens: string[];
  excludedFoods: string[];
  blacklist: string[];
  favorites: string[];
  maxCookMin: number;
  kcalTarget?: [number, number] | null;
  locked: { date: string; slot: MealSlot; recipeId: string; servings: number }[];
}

export interface PlannedMeal {
  date: string;
  slot: MealSlot;
  recipeId: string;
  servings: number;
  leftoverOf?: string | null;
}

/** PRNG determinista (mulberry32) sembrado con la semana. */
function rng(seedStr: string) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function eligibleRecipes(recipes: RecipeLike[], foods: (id: string) => FoodLike | undefined, c: Pick<MenuConstraints, "excludedAllergens" | "excludedFoods" | "blacklist">) {
  const excl = new Set(c.excludedFoods.map((s) => s.toLowerCase()));
  return recipes.filter((r) => {
    if (c.blacklist.includes(r.id)) return false;
    const al = allergensOf(r.ingredients, foods);
    if (al.some((a) => c.excludedAllergens.includes(a))) return false;
    return !r.ingredients.some((i) => {
      const f = foods(i.foodId);
      return excl.has(i.foodId) || (f && [...excl].some((e) => e && f.name.toLowerCase().includes(e)));
    });
  });
}

export function generateMenu(recipes: RecipeLike[], foods: (id: string) => FoodLike | undefined, c: MenuConstraints): PlannedMeal[] {
  const rand = rng(c.weekStart);
  const pool = eligibleRecipes(recipes, foods, c);
  const kcalOf = new Map(pool.map((r) => [r.id, recipeNutrition(r.ingredients, foods, 1, r.servings).totals.kcal]));
  const out: PlannedMeal[] = [];
  const lastUsed = new Map<string, number>();
  for (let d = 0; d < 7; d++) {
    const date = addDays(c.weekStart, d);
    const training = c.trainingDates.includes(date);
    const daySlots = c.slots.filter((s) => (s === "pre" || s === "post" ? training : true));
    for (const slot of daySlots) {
      const locked = c.locked.find((l) => l.date === date && l.slot === slot);
      if (locked) {
        out.push({ ...locked });
        lastUsed.set(locked.recipeId, d);
        continue;
      }
      // Sobras: la comida de hoy puede ser la cena de ayer si es apta para lote
      if (slot === "lunch" && d > 0) {
        const prevDinner = out.find((m) => m.date === addDays(date, -1) && m.slot === "dinner");
        const rec = prevDinner && pool.find((r) => r.id === prevDinner.recipeId);
        if (rec?.batchFriendly && !prevDinner?.leftoverOf && rand() < 0.5) {
          out.push({ date, slot, recipeId: rec.id, servings: prevDinner!.servings, leftoverOf: addDays(date, -1) });
          continue;
        }
      }
      const weekday = d < 5;
      const cands = pool
        .filter((r) => r.slots.includes(slot))
        .filter((r) => !(weekday && (slot === "lunch" || slot === "breakfast")) || r.prepMin + r.cookMin <= c.maxCookMin || r.batchFriendly)
        .map((r) => {
          const since = lastUsed.has(r.id) ? d - lastUsed.get(r.id)! : 99;
          let score = rand() * 2 + (c.favorites.includes(r.id) ? 2.5 : 0);
          if ((slot === "lunch" || slot === "dinner") && since < 3) score -= 10;
          if (since === 0) score -= 20;
          if (r.slots[0] === slot) score += 0.5;
          return { r, score };
        })
        .sort((a, b) => b.score - a.score || a.r.id.localeCompare(b.r.id));
      const pick = cands[0]?.r;
      if (!pick) continue;
      out.push({ date, slot, recipeId: pick.id, servings: 1 });
      lastUsed.set(pick.id, d);
    }
  }
  return c.kcalTarget ? scaleToTarget(out, kcalOf, c.kcalTarget, c.locked) : out;
}

/** Ajusta raciones de comida/cena/desayuno hacia el rango energético diario. */
export function scaleToTarget(
  meals: PlannedMeal[],
  kcalOf: Map<string, number>,
  [lo, hi]: [number, number],
  locked: { date: string; slot: MealSlot }[] = [],
): PlannedMeal[] {
  const byDate = new Map<string, PlannedMeal[]>();
  meals.forEach((m) => byDate.set(m.date, [...(byDate.get(m.date) ?? []), m]));
  const steps = [0.75, 1, 1.25, 1.5];
  for (const [, day] of byDate) {
    const adjustable = day.filter((m) => ["breakfast", "lunch", "dinner"].includes(m.slot) && !m.leftoverOf && !locked.some((l) => l.date === m.date && l.slot === m.slot));
    const total = () => day.reduce((a, m) => a + (kcalOf.get(m.recipeId) ?? 0) * m.servings, 0);
    const mid = (lo + hi) / 2;
    for (let iter = 0; iter < 8; iter++) {
      const t = total();
      if (t >= lo && t <= hi) break;
      const up = t < lo;
      const cand = adjustable
        .filter((m) => (up ? m.servings < 1.5 : m.servings > 0.75))
        .sort((a, b) => (kcalOf.get(b.recipeId) ?? 0) - (kcalOf.get(a.recipeId) ?? 0))[0];
      if (!cand) break;
      const i = steps.indexOf(cand.servings);
      const next = steps[Math.max(0, Math.min(steps.length - 1, (i < 0 ? 1 : i) + (up ? 1 : -1)))];
      const before = Math.abs(t - mid);
      const after = Math.abs(t + (kcalOf.get(cand.recipeId) ?? 0) * (next - cand.servings) - mid);
      if (after >= before && t >= lo && t <= hi) break;
      cand.servings = next;
    }
    // las sobras heredan raciones de su origen
    day.filter((m) => m.leftoverOf).forEach((m) => {
      const src = meals.find((x) => x.date === m.leftoverOf && x.slot === "dinner" && x.recipeId === m.recipeId);
      if (src) m.servings = src.servings;
    });
  }
  return meals;
}

/** Alternativas para sustituir una comida: mismo hueco, energía e hidratos parecidos. */
export function swapOptions(
  current: RecipeLike,
  slot: MealSlot,
  pool: RecipeLike[],
  foods: (id: string) => FoodLike | undefined,
  max = 5,
): { recipe: RecipeLike; totals: NutrientTotals; dKcal: number; dCarbs: number }[] {
  const base = recipeNutrition(current.ingredients, foods, 1, current.servings).totals;
  return pool
    .filter((r) => r.id !== current.id && r.slots.includes(slot))
    .map((r) => {
      const t = recipeNutrition(r.ingredients, foods, 1, r.servings).totals;
      return { recipe: r, totals: t, dKcal: t.kcal - base.kcal, dCarbs: t.carbsAvailableG - base.carbsAvailableG };
    })
    .sort((a, b) => Math.abs(a.dKcal) / 100 + Math.abs(a.dCarbs) / 15 - (Math.abs(b.dKcal) / 100 + Math.abs(b.dCarbs) / 15) || a.recipe.id.localeCompare(b.recipe.id))
    .slice(0, max);
}

export function slotsFor(mealsPerDay: number): MealSlot[] {
  if (mealsPerDay <= 2) return ["lunch", "dinner"];
  if (mealsPerDay === 3) return ["breakfast", "lunch", "dinner"];
  if (mealsPerDay === 4) return ["breakfast", "lunch", "snack", "dinner"];
  return ["breakfast", "pre", "lunch", "snack", "post", "dinner"];
}
