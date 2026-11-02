import { describe, expect, it } from "vitest";
import { SEED_FOOD_BY_ID } from "@/lib/domain/nutrition/foods";
import { SEED_RECIPES } from "@/lib/domain/nutrition/recipes";
import { nutrientsFor, addTotals, EMPTY_TOTALS } from "@/lib/domain/nutrition/calc";
import { dayBalance, fatRange, rebalanceOptions, type DayTargets, type RemainingMeal } from "@/lib/domain/nutrition/balance";
import { portionLabel, portionLines, roundGrams } from "@/lib/domain/nutrition/portions";

const foods = (id: string) => SEED_FOOD_BY_ID[id];
const targets: DayTargets = { kcal: [2000, 2300], proteinG: [120, 160], fatG: fatRange([2000, 2300]), carbsG: null, fiberG: 25 };

/** Desayuno real (sintético): 2 tostadas + tortilla francesa de 2 huevos con aceite. */
const breakfast = [nutrientsFor(foods("bread_white"), 60), nutrientsFor(foods("egg"), 100), nutrientsFor(foods("olive_oil"), 10)].reduce(addTotals, EMPTY_TOTALS());

describe("cantidades por ingrediente", () => {
  it("redondea para pesar y usa medidas caseras cuando cuadran", () => {
    expect(roundGrams(7.4)).toBe(7);
    expect(roundGrams(63)).toBe(65);
    expect(roundGrams(143)).toBe(140);
    expect(portionLabel(100, foods("egg"))).toBe("2 unidades (100 g)");
    expect(portionLabel(10, foods("olive_oil"))).toBe("1 cucharada (10 g)");
    expect(portionLabel(37, foods("broccoli"))).toBe("35 g");
  });
  it("escala con las raciones y da el equivalente cocinado de lo que se pesa en crudo", () => {
    const lines = portionLines([{ foodId: "chicken_raw", grams: 150 }], foods, 2, 1);
    expect(lines[0].grams).toBe(300);
    expect(lines[0].cookedG).toBe(230); // 300 × 0,75 = 225 → redondeo a 10 g
    expect(lines[0].stateNote).toMatch(/crudo/);
    for (const r of SEED_RECIPES) expect(portionLines(r.ingredients, foods, 1, r.servings).every((l) => l.grams > 0 && l.label)).toBe(true);
  });
});

describe("balance del día", () => {
  it("rango de grasa: 25–35 % de la energía o la pauta manual", () => {
    expect(fatRange([2000, 2000])).toEqual([56, 78]);
    expect(fatRange([2000, 2000], 70)).toEqual([63, 77]);
    expect(fatRange(null)).toBeNull();
  });
  it("suma lo comido y lo que queda, y avisa sin proponer saltarse comidas ni ejercicio", () => {
    const fatty = [breakfast, nutrientsFor(foods("olive_oil"), 75)];
    const dinner = SEED_RECIPES.find((r) => r.slots.includes("dinner"))!;
    const remaining: RemainingMeal[] = [{ id: "m1", slot: "dinner", recipe: dinner, servings: 1 }];
    const b = dayBalance(fatty, remaining, foods, targets);
    const fat = b.nutrients.find((n) => n.key === "fatG")!;
    expect(fat.consumed).toBeCloseTo(breakfast.fatG + 75, 5);
    expect(fat.projected).toBeGreaterThan(fat.consumed);
    expect(b.messages.join(" ")).toMatch(/grasa/);
    const all = b.messages.join(" ").toLowerCase();
    expect(all).not.toMatch(/sáltate|omite la|no cenes|quema|más intens/);
    expect(all).toMatch(/sin saltarte comidas|no hace falta compensarlo/);
  });
  it("propone reajustar lo que queda con menos grasa, priorizando mantener los hidratos", () => {
    const fatty = [breakfast, nutrientsFor(foods("olive_oil"), 40), nutrientsFor(foods("bread_white"), 120)];
    const dinners = SEED_RECIPES.filter((r) => r.slots.includes("dinner"));
    // la cena prevista más grasa
    const cur = [...dinners].sort((a, b) => {
      const f = (r: typeof a) => r.ingredients.reduce((s, i) => s + nutrientsFor(foods(i.foodId), i.grams / r.servings).fatG, 0);
      return f(b) - f(a);
    })[0];
    const remaining: RemainingMeal[] = [{ id: "cena", slot: "dinner", recipe: cur, servings: 1 }];
    const opts = rebalanceOptions(fatty, remaining, SEED_RECIPES, foods, targets);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.every((o) => o.servings >= 0.75)).toBe(true);
    const before = dayBalance(fatty, remaining, foods, targets).projected.fatG;
    expect(opts[0].totals.fatG).toBeLessThan(before);
    // las que cambian hidratos van detrás y marcadas
    const firstChanged = opts.findIndex((o) => o.carbsChanged);
    if (firstChanged >= 0) expect(opts.slice(firstChanged).every((o) => o.carbsChanged)).toBe(true);
  });
  it("si el día ya cuadra no propone cambios", () => {
    expect(rebalanceOptions([], [], SEED_RECIPES, foods, { ...targets, kcal: [0, 99999], proteinG: [0, 9999], fatG: [0, 9999] })).toEqual([]);
  });
});
