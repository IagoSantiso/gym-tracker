/** Balance del día (lo comido + lo que queda del menú) y opciones para reajustar el resto. */
import { tbl } from "@/lib/db/db";
import { active } from "@/lib/db/repo";
import { dayBalance, rebalanceOptions, type DayBalance, type DayTargets, type RebalanceOption, type RemainingMeal } from "@/lib/domain/nutrition/balance";
import { eligibleRecipes } from "@/lib/domain/nutrition/menu";
import { localDate } from "@/lib/domain/time";
import type { FoodLog } from "@/lib/db/types";
import { loadCatalog, type Catalog } from "./nutrition";
import { currentTargets } from "./targets";

export interface DayBalanceView extends DayBalance {
  date: string;
  logs: FoodLog[];
  remaining: RemainingMeal[];
  targets: DayTargets;
  options: RebalanceOption[];
}

export async function loadDayBalance(date = localDate(), cat?: Catalog): Promise<DayBalanceView> {
  const c = cat ?? (await loadCatalog());
  const [logs, entries, ct, prefs] = await Promise.all([
    tbl("food_logs").where("date").equals(date).toArray().then((l) => l.filter(active)),
    tbl("meal_entries").where("date").equals(date).toArray().then((l) => l.filter(active)),
    currentTargets(),
    tbl("preferences").get("me"),
  ]);
  const loggedSlots = new Set(logs.map((l) => l.slot));
  const remaining: RemainingMeal[] = entries
    .filter((e) => e.status === "planned" && !loggedSlots.has(e.slot))
    .flatMap((e) => {
      const recipe = c.recipe(e.recipeId);
      return recipe ? [{ id: e.id, slot: e.slot, recipe, servings: e.servings }] : [];
    });
  const targets: DayTargets = { kcal: ct.kcal, proteinG: ct.proteinG, fatG: ct.fatG, carbsG: ct.carbsG, fiberG: ct.fiberG };
  const totals = logs.map((l) => l.totals);
  const hasEstimates = logs.some((l) => l.source === "estimated" || l.source === "ai_draft");
  const b = dayBalance(totals, remaining, c.food, targets, { hasEstimates });
  const pool = eligibleRecipes(c.recipes, c.food, {
    excludedAllergens: [...(prefs?.allergies ?? []), ...(prefs?.intolerances ?? [])],
    excludedFoods: prefs?.excludedFoods ?? [],
    blacklist: [],
  });
  const options = logs.length ? rebalanceOptions(totals, remaining, pool, c.food, targets) : [];
  return { ...b, date, logs, remaining, targets, options };
}
