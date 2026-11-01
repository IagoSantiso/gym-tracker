import { describe, expect, it } from "vitest";
import { SEED_FOOD_BY_ID, SEED_FOODS } from "@/lib/domain/nutrition/foods";
import { SEED_RECIPES } from "@/lib/domain/nutrition/recipes";
import { availableCarbsPer100, cookedFromRaw, fmtNutrient, nutrientsFor, rawFromCooked, recipeNutrition } from "@/lib/domain/nutrition/calc";
import { eligibleRecipes, generateMenu, slotsFor, swapOptions } from "@/lib/domain/nutrition/menu";
import { buildShoppingList, quantityLabel } from "@/lib/domain/nutrition/shopping";
import { estimateEnergy, weeklyRate, weightTrend } from "@/lib/domain/nutrition/targets";
import { addDays } from "@/lib/domain/time";

const foods = (id: string) => SEED_FOOD_BY_ID[id];

describe("base de alimentos", () => {
  it("todas las recetas usan alimentos existentes", () => {
    for (const r of SEED_RECIPES) for (const i of r.ingredients) expect(foods(i.foodId), `${r.id}: ${i.foodId}`).toBeTruthy();
  });
  it("energía coherente con macros (Atwater ±20 %)", () => {
    // USDA aplica factores de Atwater específicos al cacao (valor oficial 228 kcal): se excluye
    for (const f of SEED_FOODS.filter((x) => x.id !== "cocoa")) {
      const p = f.per100;
      const atwater = 4 * (p.proteinG ?? 0) + 4 * (p.carbsAvailableG ?? 0) + 2 * (p.fiberG ?? 0) + 9 * (p.fatG ?? 0);
      if ((p.kcal ?? 0) > 30) expect(Math.abs(atwater - p.kcal!) / p.kcal!, f.name).toBeLessThan(0.2);
    }
  });
  it("hidratos disponibles = totales − fibra en fuente USDA", () => {
    const lentils = foods("lentils_cooked");
    expect(availableCarbsPer100(lentils.per100, "total")).toBeCloseTo(20.13 - 7.9, 2);
    expect(availableCarbsPer100({ ...lentils.per100, carbsAvailableG: null, carbsTotalG: 12 }, "available")).toBe(12);
  });
});

describe("cálculo nutricional", () => {
  it("por ingrediente escala linealmente", () => {
    const t = nutrientsFor(foods("rice_cooked"), 200);
    expect(t.kcal).toBeCloseTo(260, 5);
    expect(t.carbsAvailableG).toBeCloseTo((28.17 - 0.4) * 2, 5);
  });
  it("receta por ración y por raciones", () => {
    const r = SEED_RECIPES.find((x) => x.id === "pollo-arroz-brocoli")!;
    const one = recipeNutrition(r.ingredients, foods, 1).totals;
    const two = recipeNutrition(r.ingredients, foods, 2).totals;
    expect(two.kcal).toBeCloseTo(one.kcal * 2, 5);
    const manual = 1.5 * 120 + 0.7 * 365 + 1.5 * 34 + 0.1 * 884;
    expect(one.kcal).toBeCloseTo(manual, 5);
  });
  it("crudo ↔ cocinado con factor de rendimiento", () => {
    expect(cookedFromRaw(70, 2.8)).toBeCloseTo(196);
    expect(rawFromCooked(196, 2.8)).toBeCloseTo(70);
    // 70 g de arroz crudo ≈ 196 g cocido: los hidratos deberían ser similares (±10 %)
    const raw = nutrientsFor(foods("rice_raw"), 70).carbsAvailableG;
    const cooked = nutrientsFor(foods("rice_cooked"), 196).carbsAvailableG;
    expect(Math.abs(raw - cooked) / raw).toBeLessThan(0.1);
  });
  it("marca nutrientes ausentes en vez de inventarlos", () => {
    const f = { ...foods("tomato"), per100: { ...foods("tomato").per100, sugarsG: null } };
    const t = nutrientsFor(f, 100);
    expect(t.missing[0]).toMatch(/sugarsG/);
    expect(t.sugarsG).toBe(0);
  });
  it("redondeo de presentación", () => {
    expect(fmtNutrient("kcal", 123.6)).toBe("124");
    expect(fmtNutrient("proteinG", 12.4)).toBe("12");
    expect(fmtNutrient("proteinG", 4.26)).toBe("4,3");
    expect(fmtNutrient("saltG", 0.456)).toBe("0,46");
  });
});

describe("menús y lista de compra", () => {
  const base = { weekStart: "2026-11-02", trainingDates: ["2026-11-02", "2026-11-04"], excludedAllergens: [], excludedFoods: [], blacklist: [], favorites: [], maxCookMin: 30, kcalTarget: null, locked: [] };
  it("es determinista y cubre todos los huecos", () => {
    const c = { ...base, slots: slotsFor(4) };
    const a = generateMenu(SEED_RECIPES, foods, c);
    const b = generateMenu(SEED_RECIPES, foods, c);
    expect(a).toEqual(b);
    expect(a).toHaveLength(7 * 4);
  });
  it("respeta alérgenos, exclusiones y lista negra", () => {
    const c = { ...base, slots: slotsFor(3), excludedAllergens: ["gluten", "pescado"], excludedFoods: ["huevo"], blacklist: ["lentejas-verduras"] };
    const menu = generateMenu(SEED_RECIPES, foods, c);
    for (const m of menu) {
      const r = SEED_RECIPES.find((x) => x.id === m.recipeId)!;
      expect(r.id).not.toBe("lentejas-verduras");
      for (const i of r.ingredients) {
        expect(foods(i.foodId).allergens).not.toContain("gluten");
        expect(foods(i.foodId).allergens).not.toContain("pescado");
        expect(foods(i.foodId).name.toLowerCase()).not.toContain("huevo");
      }
    }
  });
  it("no repite la misma comida/cena en días consecutivos salvo sobras", () => {
    const menu = generateMenu(SEED_RECIPES, foods, { ...base, slots: slotsFor(3) });
    for (let d = 1; d < 7; d++) {
      const date = addDays(base.weekStart, d);
      const prev = addDays(base.weekStart, d - 1);
      const today = menu.find((m) => m.date === date && m.slot === "dinner")!;
      const yday = menu.find((m) => m.date === prev && m.slot === "dinner")!;
      expect(today.recipeId).not.toBe(yday.recipeId);
    }
  });
  it("pre/post solo en días de entrenamiento", () => {
    const menu = generateMenu(SEED_RECIPES, foods, { ...base, slots: slotsFor(6) });
    expect(menu.filter((m) => m.slot === "pre").map((m) => m.date)).toEqual(base.trainingDates);
  });
  it("ajusta raciones hacia el rango energético dentro de 0,75–1,5", () => {
    const menu = generateMenu(SEED_RECIPES, foods, { ...base, slots: slotsFor(4), kcalTarget: [2300, 2500] });
    for (const m of menu) {
      expect(m.servings).toBeGreaterThanOrEqual(0.75);
      expect(m.servings).toBeLessThanOrEqual(1.5);
    }
    expect(menu.some((m) => m.servings > 1)).toBe(true);
  });
  it("sustitución: opciones del mismo hueco ordenadas por cercanía", () => {
    const cur = SEED_RECIPES.find((r) => r.id === "pollo-arroz-brocoli")!;
    const opts = swapOptions(cur, "lunch", eligibleRecipes(SEED_RECIPES, foods, { excludedAllergens: [], excludedFoods: [], blacklist: [] }), foods);
    expect(opts.length).toBeGreaterThan(2);
    expect(opts.every((o) => o.recipe.slots.includes("lunch"))).toBe(true);
  });
  it("lista de compra consolida, descuenta despensa y recalcula tras sustituir", () => {
    const meals = [
      { recipeId: "pollo-arroz-brocoli", servings: 1 },
      { recipeId: "pollo-arroz-brocoli", servings: 1.5 },
      { recipeId: "cuscus-pollo-verduras", servings: 1 },
    ];
    const rec = (id: string) => SEED_RECIPES.find((r) => r.id === id);
    const list = buildShoppingList(meals, rec, foods, [{ foodId: "olive_oil", grams: 1000 }]);
    const chicken = list.find((i) => i.foodId === "chicken_raw")!;
    expect(chicken.grams).toBe(150 * 2.5 + 140);
    expect(list.find((i) => i.foodId === "olive_oil")!.pantryGrams).toBe(33);
    const swapped = buildShoppingList([meals[0], meals[1], { recipeId: "alubias-verduras", servings: 1 }], rec, foods, [], list.map((i) => ({ ...i, checked: i.foodId === "rice_raw" })));
    expect(swapped.find((i) => i.foodId === "chicken_raw")!.grams).toBe(375);
    expect(swapped.find((i) => i.foodId === "white_beans_cooked")).toBeTruthy();
    expect(swapped.find((i) => i.foodId === "rice_raw")!.checked).toBe(true);
    expect(quantityLabel(150, foods("egg"))).toMatch(/3 unidades/);
  });
});

describe("objetivos energéticos", () => {
  const p = { birthDate: "1990-05-01", sex: "male" as const, heightCm: 180 };
  const g = { primaryGoal: "fat_loss" as const, weightLossRatePct: 0.5, calorieMode: "estimated" as const, manualKcal: null };
  it("no calcula sin datos mínimos", () => {
    const e = estimateEnergy({ ...p, heightCm: null }, g, 85, "2026-11-01", { weeklyExerciseMin: 200, avgSteps: null });
    expect(e.ok).toBe(false);
    expect(e.missing).toContain("altura");
  });
  it("devuelve rango, déficit limitado y nunca bajo el BMR", () => {
    const e = estimateEnergy(p, g, 85, "2026-11-01", { weeklyExerciseMin: 200, avgSteps: 8000 });
    expect(e.ok).toBe(true);
    expect(e.target![0]).toBeLessThan(e.target![1]);
    expect(e.deficitKcal).toBe(Math.round((0.005 * 85 * 7700) / 7));
    const extreme = estimateEnergy(p, { ...g, weightLossRatePct: 3 }, 85, "2026-11-01", { weeklyExerciseMin: 0, avgSteps: null });
    expect(extreme.warnings.join(" ")).toMatch(/1 %|25 %/);
    expect(extreme.target![0]).toBeGreaterThanOrEqual(Math.round((10 * 85 + 6.25 * 180 - 5 * 36 + 5) / 10) * 10 - 10);
  });
  it("tendencia de peso suavizada y ritmo semanal", () => {
    const entries = Array.from({ length: 28 }, (_, i) => ({ date: addDays("2026-10-01", i), weightKg: 85 - i * 0.07 + (i % 3 === 0 ? 0.6 : 0) }));
    const t = weightTrend(entries);
    expect(t).toHaveLength(28);
    const rate = weeklyRate(t)!;
    expect(rate).toBeLessThan(-0.3);
    expect(rate).toBeGreaterThan(-0.7);
  });
});
