/** Nutrición: catálogo (semilla + propio), menús, comidas registradas, lista de la compra. */
import { getDb, tbl } from "@/lib/db/db";
import { active, all, bulkPut, nowIso, patch, put, remove } from "@/lib/db/repo";
import type { Food, FoodLog, MealEntry, MealSlot, Recipe, RecipeIngredientData } from "@/lib/db/types";
import { SEED_FOOD_BY_ID, SEED_FOODS } from "@/lib/domain/nutrition/foods";
import { SEED_RECIPES } from "@/lib/domain/nutrition/recipes";
import { recipeNutrition, type FoodLike } from "@/lib/domain/nutrition/calc";
import { MENU_VERSION, generateMenu, slotsFor, type RecipeLike } from "@/lib/domain/nutrition/menu";
import { buildShoppingList } from "@/lib/domain/nutrition/shopping";
import { addDays, localDate, weekStartOf } from "@/lib/domain/time";
import { consumeFoodLog } from "./kitchen";
import { serial } from "./lock";

export interface Catalog {
  foods: FoodLike[];
  food: (id: string) => FoodLike | undefined;
  recipes: (RecipeLike & { source: string; steps: string[]; tags: string[]; difficulty: number })[];
  recipe: (id: string) => (RecipeLike & { source: string; steps: string[]; tags: string[]; difficulty: number }) | undefined;
}

export async function loadCatalog(): Promise<Catalog> {
  const custom = await all("foods");
  const foods: FoodLike[] = [...SEED_FOODS.filter((f) => !custom.some((c) => c.id === f.id)), ...custom];
  const fmap = new Map(foods.map((f) => [f.id, f]));
  const myRecipes = await all("recipes");
  const ings = await all("recipe_ingredients");
  const recipes = [
    ...SEED_RECIPES.filter((r) => !myRecipes.some((m) => m.id === r.id)),
    ...myRecipes.map((r) => ({ ...r, ingredients: ings.filter((i) => i.recipeId === r.id).sort((a, b) => a.sortOrder - b.sortOrder) as RecipeIngredientData[] })),
  ];
  const rmap = new Map(recipes.map((r) => [r.id, r]));
  return { foods, food: (id) => fmap.get(id) ?? SEED_FOOD_BY_ID[id], recipes, recipe: (id) => rmap.get(id) };
}

export function generateWeekMenu(weekStart: string, opts: { kcalTarget: [number, number] | null; keepLocked: boolean }) {
  return serial("menu", () => generateWeekMenuInner(weekStart, opts));
}

async function generateWeekMenuInner(weekStart: string, opts: { kcalTarget: [number, number] | null; keepLocked: boolean }) {
  const cat = await loadCatalog();
  const prefs = await tbl("preferences").get("me");
  const rp = await all("recipe_prefs");
  const existingPlan = (await tbl("meal_plans").where("weekStart").equals(weekStart).toArray()).find(active);
  const existing = existingPlan ? (await tbl("meal_entries").where("mealPlanId").equals(existingPlan.id).toArray()).filter(active) : [];
  const locked = opts.keepLocked ? existing.filter((e) => e.locked || e.status === "eaten" || e.status === "replaced") : [];
  const planned = (await tbl("planned_items").where("weekStart").equals(weekStart).toArray()).filter((i) => active(i) && i.kind !== "rest" && i.kind !== "walk" && i.status !== "cancelled");
  const pantry = await all("pantry_items");
  const menu = generateMenu(cat.recipes, cat.food, {
    weekStart,
    stock: pantry,
    frequencies: { "bacalao-garbanzos-espinacas": "occasional", ...Object.fromEntries(rp.map(r => [r.recipeId, r.frequency ?? "regular"])) },
    revision: Number(existingPlan?.settings.revision ?? 0) + (existingPlan ? 1 : 0),
    slots: slotsFor(prefs?.mealsPerDay ?? 4),
    trainingDates: [...new Set(planned.map((p) => p.date))],
    excludedAllergens: [...(prefs?.allergies ?? []), ...(prefs?.intolerances ?? [])],
    excludedFoods: [...(prefs?.excludedFoods ?? []), ...(prefs?.foodContext?.avoid ?? [])],
    blacklist: rp.filter((r) => r.blacklisted).map((r) => r.recipeId),
    favorites: [...rp.filter((r) => r.favorite).map((r) => r.recipeId), ...cat.recipes.filter(r => r.tags.includes("desayuno-habitual")).map(r => r.id)],
    maxCookMin: prefs?.cookingTimeMin ?? 30,
    kcalTarget: opts.kcalTarget,
    locked: locked.map((l) => ({ date: l.date, slot: l.slot, recipeId: l.recipeId, servings: l.servings, reserveStock: l.status === "planned" })),
  });
  const plan = existingPlan
    ? await patch("meal_plans", existingPlan.id, { generatedAt: nowIso(), generatorVersion: MENU_VERSION, settings: { kcalTarget: opts.kcalTarget, revision: Number(existingPlan?.settings.revision ?? 0) + (existingPlan ? 1 : 0) } })
    : await put("meal_plans", { weekStart, generatedAt: nowIso(), generatorVersion: MENU_VERSION, settings: { kcalTarget: opts.kcalTarget } });
  const keepIds = new Set(locked.map((l) => l.id));
  await remove("meal_entries", existing.filter((e) => !keepIds.has(e.id)).map((e) => e.id));
  await bulkPut("meal_entries", menu
    .filter((m) => !locked.some((l) => l.date === m.date && l.slot === m.slot))
    .map((m) => ({ mealPlanId: plan!.id, date: m.date, slot: m.slot, recipeId: m.recipeId, servings: m.servings, locked: false, status: "planned" as const, replacedFrom: null, notes: m.leftoverOf ? `Sobras de la cena del ${m.leftoverOf}` : null })));
  await refreshShoppingList(weekStart);
}

export async function weekMeals(weekStart: string): Promise<MealEntry[]> {
  const plan = (await tbl("meal_plans").where("weekStart").equals(weekStart).toArray()).find(active);
  if (!plan) return [];
  return (await tbl("meal_entries").where("mealPlanId").equals(plan.id).toArray()).filter(active);
}

export async function swapMeal(entryId: string, recipeId: string) {
  const e = await tbl("meal_entries").get(entryId);
  if (!e) return;
  await patch("meal_entries", entryId, { recipeId, replacedFrom: e.replacedFrom ?? e.recipeId, status: "planned", notes: null });
  const plan = await tbl("meal_plans").get(e.mealPlanId);
  if (plan) await refreshShoppingList(plan.weekStart);
}

export async function restoreMeal(entryId: string) {
  const e = await tbl("meal_entries").get(entryId);
  if (!active(e) || !e.replacedFrom || e.status !== "planned") return;
  await patch("meal_entries", e.id, { recipeId: e.replacedFrom, replacedFrom: null, notes: null });
  await refreshShoppingList(weekStartOf(e.date));
}

export async function refreshShoppingList(weekStart: string) {
  const cat = await loadCatalog();
  const meals = await weekMeals(weekStart);
  const { stockGrams } = await import("@/lib/domain/nutrition/kitchen");
  const pantry = [...stockGrams(await all("pantry_items"), localDate())].map(([foodId, grams]) => ({ foodId, grams }));
  const prev = (await tbl("shopping_lists").where("weekStart").equals(weekStart).toArray()).find(active);
  const items = buildShoppingList(
    meals.map((m) => ({ recipeId: m.recipeId, servings: m.servings, status: m.status, leftoverOf: m.notes?.startsWith("Sobras") ? "x" : null })),
    cat.recipe, cat.food, pantry, prev?.items ?? [],
  );
  if (prev) await patch("shopping_lists", prev.id, { items, generatedAt: nowIso() });
  else await put("shopping_lists", { weekStart, mealPlanId: null, items, generatedAt: nowIso(), extra: [] });
}

/** Marca una comida prevista como realizada y crea el registro con instantánea nutricional. */
export async function markEaten(entry: MealEntry, servings?: number): Promise<FoodLog | undefined> {
  return serial("food-log", () => markEatenInner(entry, servings));
}
async function markEatenInner(entry: MealEntry, servings?: number): Promise<FoodLog | undefined> {
  const previous = (await all("food_logs")).find(l => l.mealEntryId === entry.id);
  if (previous) return previous;
  const cat = await loadCatalog();
  const r = cat.recipe(entry.recipeId);
  if (!r) return;
  const s = servings ?? entry.servings;
  const { lines, totals } = recipeNutrition(r.ingredients, cat.food, s, r.servings);
  const db = getDb();
  const log = await db.transaction("rw", [db.table("meal_entries"), db.table("food_logs"), db.table("pantry_items"), db.outbox], async () => {
  await patch("meal_entries", entry.id, { status: "eaten", servings: s });
  const log = await put("food_logs", {
    date: entry.date, eatenAt: nowIso(), slot: entry.slot, mealEntryId: entry.id, recipeId: r.id, servings: s,
    items: lines.map((l) => ({ foodId: l.foodId, grams: Math.round(l.grams) })), title: r.name, totals, source: "calculated", note: null,
  });
  await consumeFoodLog(log.id);
  return log;
  });
  await refreshShoppingList(weekStartOf(entry.date));
  return log;
}

/**
 * Lo comido en un hueco sustituye a lo previsto: la comida del menú de ese día y hueco pasa a
 * «replaced» (el menú sugerido se conserva como referencia; lo registrado es lo real).
 */
export async function replacePlannedSlot(date: string, slot: MealSlot): Promise<MealEntry | undefined> {
  const entries = (await tbl("meal_entries").where("date").equals(date).toArray()).filter(active);
  const e = entries.find((x) => x.slot === slot && x.status === "planned");
  if (e) await patch("meal_entries", e.id, { status: "replaced" });
  return e;
}

export async function logFreeMeal(opts: { slot: MealSlot; title: string; items: { foodId: string; grams: number }[]; date?: string; eatenAt?: string }) {
  if(!opts.title.trim() || !opts.items.length || opts.items.some(i=>!Number.isFinite(i.grams)||i.grams<=0||i.grams>100000)) throw new Error("Revisa el plato y las cantidades.");
  const cat = await loadCatalog();
  const { totals } = recipeNutrition(opts.items.map((i) => ({ ...i, note: null })), cat.food, 1, 1);
  const log = await put("food_logs", {
    date: opts.date ?? localDate(), eatenAt: opts.eatenAt ?? nowIso(), slot: opts.slot, mealEntryId: null, recipeId: null, servings: null,
    items: opts.items, title: opts.title, totals, source: "calculated", note: null,
  });
  const { consumeFoodLog } = await import("./kitchen");
  await consumeFoodLog(log.id);
  await refreshShoppingList(weekStartOf(log.date));
  return log;
}

/** Registro rápido solo con hidratos/energía de una etiqueta (dato manual). */
export async function logManualMeal(opts: { slot: MealSlot; title: string; carbsG: number | null; kcal: number | null; proteinG: number | null; fatG?: number | null; date?: string; estimated?: boolean; eatenAt?: string }) {
  if(!opts.title.trim() || [opts.kcal,opts.carbsG,opts.proteinG,opts.fatG].some(v=>v!=null&&(!Number.isFinite(v)||v<0||v>20000))) throw new Error("Revisa las cantidades de la comida.");
  return put("food_logs", {
    date: opts.date ?? localDate(opts.eatenAt ?? Date.now()), eatenAt: opts.eatenAt ?? nowIso(), slot: opts.slot, mealEntryId: null, recipeId: null, servings: null,
    items: [], title: opts.title,
    totals: { kcal: opts.kcal ?? 0, proteinG: opts.proteinG ?? 0, carbsAvailableG: opts.carbsG ?? 0, fiberG: 0, fatG: opts.fatG ?? 0, satFatG: 0, sugarsG: 0, saltG: 0, missing: [...(opts.carbsG == null ? ["carbsAvailableG"] : []), "fiberG", "satFatG", "sugarsG", "saltG", ...(opts.fatG == null ? ["fatG"] : []), ...(opts.kcal == null ? ["kcal"] : []), ...(opts.proteinG == null ? ["proteinG"] : [])] },
    source: opts.estimated ? "estimated" : "manual", note: null,
  });
}

export async function setRecipePref(recipeId: string, changes: { favorite?: boolean; blacklisted?: boolean; frequency?: "regular" | "occasional" | "stock_only" | "never" }) {
  const ex = (await tbl("recipe_prefs").where("recipeId").equals(recipeId).toArray()).find(active);
  if (ex) await patch("recipe_prefs", ex.id, changes);
  else await put("recipe_prefs", { recipeId, favorite: !!changes.favorite, blacklisted: !!changes.blacklisted, frequency: changes.frequency ?? "regular", lastUsed: null });
}

export async function saveRecipe(r: Omit<Recipe, "createdAt" | "updatedAt" | "id"> & { id?: string }, ingredients: RecipeIngredientData[]) {
  const saved = await put("recipes", { ...r, source: "manual" });
  const old = (await tbl("recipe_ingredients").where("recipeId").equals(saved.id).toArray()).filter(active);
  await remove("recipe_ingredients", old.map((o) => o.id));
  await bulkPut("recipe_ingredients", ingredients.map((i, k) => ({ ...i, recipeId: saved.id, sortOrder: k })));
  return saved;
}

/* ───────── Open Food Facts (ODbL) ───────── */

export async function lookupBarcode(code: string): Promise<Omit<Food, "id" | "createdAt" | "updatedAt"> | { error: string }> {
  if (!/^\d{6,14}$/.test(code)) return { error: "Código de barras no válido." };
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments,allergens_tags,code`, { headers: { Accept: "application/json" } });
    if (!res.ok) return { error: `Open Food Facts respondió ${res.status}.` };
    const j = await res.json();
    if (j.status !== 1 || !j.product) return { error: "Producto no encontrado en Open Food Facts." };
    const n = j.product.nutriments ?? {};
    const num = (k: string) => (typeof n[k] === "number" ? n[k] : n[k] != null && n[k] !== "" ? Number(n[k]) : null);
    const kcal = num("energy-kcal_100g") ?? (num("energy_100g") != null ? num("energy_100g")! / 4.184 : null);
    const carbs = num("carbohydrates_100g");
    const map: Record<string, string> = { "en:gluten": "gluten", "en:milk": "lactosa", "en:eggs": "huevo", "en:fish": "pescado", "en:crustaceans": "marisco", "en:nuts": "frutos_secos", "en:peanuts": "cacahuete", "en:soybeans": "soja", "en:sesame-seeds": "sesamo" };
    return {
      name: j.product.product_name || `Producto ${code}`, brand: j.product.brands ?? null, barcode: code, state: "as_sold",
      per100: { kcal: kcal != null ? Math.round(kcal) : null, proteinG: num("proteins_100g"), carbsAvailableG: carbs, carbsTotalG: null, fiberG: num("fiber_100g"), fatG: num("fat_100g"), satFatG: num("saturated-fat_100g"), sugarsG: num("sugars_100g"), saltG: num("salt_100g") },
      carbBasis: "available", sourceId: "off", sourceRef: `OFF ${code}`, sourceVersion: "API v2", retrievedAt: nowIso(), section: "otros",
      yieldFactor: null, rawFoodId: null, unitWeights: null, tags: [], allergens: (j.product.allergens_tags ?? []).map((a: string) => map[a]).filter(Boolean),
      notes: "Datos de Open Food Facts (ODbL). En la UE «hidratos» = disponibles. Verifica con la etiqueta.", source: "imported",
    };
  } catch {
    return { error: "Sin conexión con Open Food Facts. Puedes crear el alimento a mano con la etiqueta." };
  }
}

export const todayMealsRange = (date: string) => ({ from: date, to: addDays(date, 0) });
