import { getDb, tbl } from "@/lib/db/db";
import { active, all, newId, patch, put, remove } from "@/lib/db/repo";
import type { PantryItem, RecipeIngredientData } from "@/lib/db/types";
import { consumption } from "@/lib/domain/nutrition/kitchen";
import { localDate, weekStartOf } from "@/lib/domain/time";
import { loadCatalog, refreshShoppingList, replacePlannedSlot, saveRecipe } from "./nutrition";

export async function saveStock(input: Omit<PantryItem, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
  if (!Number.isFinite(input.grams) || input.grams < 0 || input.grams > 100000 || (input.portions != null && (!Number.isFinite(input.portions) || input.portions < 0 || input.portions > 100))) throw new Error("Revisa las cantidades.");
  if (!input.name.trim()) throw new Error("Escribe el alimento.");
  const r = await put("pantry_items", input);
  await refreshShoppingList(weekStartOf(localDate()));
  return r;
}

/** Atomic and idempotent: each log deducts confirmed quantities once. Unknown stock is untouched. */
export async function consumeFoodLog(id: string) {
  const db = getDb();
  await db.transaction("rw", [db.table("food_logs"), db.table("pantry_items"), db.outbox], async () => {
    const log = await tbl("food_logs").get(id);
    if (!active(log) || log.stockUsage != null) return;
    const stock = await all("pantry_items");
    const changes = consumption(stock, log.items, log.date);
    for (const c of changes) await patch("pantry_items", c.id, { grams: c.after });
    await patch("food_logs", id, { stockUsage: changes.map(c => ({ id: c.id, grams: c.before - c.after })) });
  });
}

export async function undoStockUsage(logId: string) {
  const db = getDb();
  await db.transaction("rw", [db.table("food_logs"), db.table("pantry_items"), db.outbox], async () => {
    const log = await tbl("food_logs").get(logId);
    if (!active(log) || !log.stockUsage?.length) return;
    for (const u of log.stockUsage) {
      const p = await tbl("pantry_items").get(u.id);
      if (p) await patch("pantry_items", u.id, { grams: p.grams + u.grams, portions: (p.portions ?? 0) + (u.portions ?? 0), deletedAt: null });
    }
    await patch("food_logs", logId, { stockUsage: [] });
  });
  await refreshShoppingList(weekStartOf(localDate()));
}

export async function deleteFoodLog(logId: string) {
  const log = await tbl("food_logs").get(logId);
  if (!active(log)) return;
  await undoStockUsage(logId);
  if (log.mealEntryId) await patch("meal_entries", log.mealEntryId, { status: "planned" });
  await remove("food_logs", logId);
  await refreshShoppingList(weekStartOf(log.date));
}

/** Save a meal-specific variant; never mutate the shared recipe or another day's portions. */
export async function applyIngredientVariant(entryId: string, expectedRecipeId: string, ingredients: RecipeIngredientData[], name: string, steps: string[]) {
  const cat = await loadCatalog();
  const db = getDb();
  await db.transaction("rw", [db.table("recipes"), db.table("recipe_ingredients"), db.table("meal_entries"), db.outbox], async () => {
    const e = await tbl("meal_entries").get(entryId);
    if (!active(e) || e.recipeId !== expectedRecipeId || e.status !== "planned") throw new Error("La comida ha cambiado. Vuelve a abrirla.");
    const r = cat.recipe(e.recipeId);
    if (!r) throw new Error("Receta no disponible.");
    const saved = await saveRecipe({ name, slots: [e.slot], servings: r.servings, prepMin: r.prepMin, cookMin: r.cookMin, difficulty: 1, steps, tags: ["variante-personal"], batchFriendly: false, source: "manual" }, ingredients);
    await patch("meal_entries", e.id, { recipeId: saved.id, replacedFrom: e.replacedFrom ?? e.recipeId, notes: "Variante personal. Revisa la preparación y los hidratos.", locked: true });
  });
  const e = await tbl("meal_entries").get(entryId);
  if (e) await refreshShoppingList(weekStartOf(e.date));
}

export async function eatLeftover(stockId: string, slot: "lunch" | "dinner", portions: number) {
  const cat = await loadCatalog();
  const { recipeNutrition } = await import("@/lib/domain/nutrition/calc");
  const db = getDb();
  const date = localDate();
  await db.transaction("rw", [db.table("pantry_items"), db.table("food_logs"), db.table("meal_entries"), db.outbox], async () => {
    const p = await tbl("pantry_items").get(stockId);
    if (!active(p) || !p.recipeId || (p.portions ?? 0) < portions || portions <= 0 || (p.useBy && p.useBy < date)) throw new Error("Revisa las raciones y la fecha.");
    const r = cat.recipe(p.recipeId);
    if (!r) throw new Error("No se encuentra la receta.");
    const { lines, totals } = recipeNutrition(r.ingredients, cat.food, portions, r.servings);
    await replacePlannedSlot(date, slot);
    await put("food_logs", { id: newId(), date, eatenAt: new Date().toISOString(), slot, recipeId: r.id, servings: portions, title: p.name, totals, items: lines.map(i => ({ foodId: i.foodId, grams: i.grams })), source: "calculated", stockUsage: [{ id: p.id, grams: 0, portions }] });
    await patch("pantry_items", p.id, { portions: (p.portions ?? 0) - portions });
  });
  await refreshShoppingList(weekStartOf(date));
}
