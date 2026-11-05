import { getDb, tbl } from "@/lib/db/db";
import { active, patch, put } from "@/lib/db/repo";
import type { FoodLog, MealSlot } from "@/lib/db/types";
import { diarySignature, scaleNutrition } from "@/lib/domain/nutrition/diary";
import { weekStartOf } from "@/lib/domain/time";
import { recipeNutrition } from "@/lib/domain/nutrition/calc";
import { loadCatalog, refreshShoppingList } from "./nutrition";
import { consumeFoodLog } from "./kitchen";

export async function confirmDiary(date: string, confirmed: boolean) {
  const db = getDb();
  await db.transaction(
    "rw",
    [db.table("food_logs"), db.table("daily_activity"), db.outbox],
    async () => {
      const logs = (
        await tbl("food_logs").where("date").equals(date).toArray()
      ).filter(active);
      if (confirmed && !logs.length)
        throw new Error("Registra las comidas antes de confirmar el día.");
      await put("daily_activity", {
        id: `nutrition-${date}`,
        date,
        source: "manual",
        nutritionSignature: confirmed ? diarySignature(logs) : null,
      });
    },
  );
}
export async function repeatMeal(
  id: string,
  date: string,
  eatenAt: string,
  slot?: MealSlot,
) {
  const log = await tbl("food_logs").get(id);
  if (!active(log)) throw new Error("La comida ya no está disponible.");
  const db = getDb();
  return db.transaction(
    "rw",
    [db.table("food_logs"), db.table("pantry_items"), db.outbox],
    async () => {
      const saved = await put("food_logs", {
        date,
        eatenAt,
        slot: slot ?? log.slot,
        title: log.title,
        items: log.items,
        totals: log.totals,
        source: log.source,
        recipeId: log.recipeId,
        servings: log.servings,
        mealEntryId: null,
        favorite: false,
        note: "Repetida de un registro anterior",
      });
      await consumeFoodLog(saved.id);
      return saved;
    },
  );
}
/** Quantity correction restores then deducts pantry within the same transaction. */
export async function editMeal(
  id: string,
  input: {
    title: string;
    date: string;
    eatenAt: string;
    slot: MealSlot;
    factor: number;
    kcal?: number | null;
    items?: FoodLog["items"];
  },
) {
  if (
    !input.title.trim() ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    !Number.isFinite(Date.parse(input.eatenAt))
  )
    throw new Error("Revisa nombre y fecha.");
  const cat=input.items ? await loadCatalog():null;
  if(input.items && (!input.items.length || input.items.some(i=>!cat?.food(i.foodId)||!Number.isFinite(i.grams)||i.grams<=0||i.grams>100000)))throw new Error("Revisa los alimentos y sus cantidades.");
  const db = getDb();
  await db.transaction(
    "rw",
    [
      db.table("food_logs"),
      db.table("pantry_items"),
      db.table("meal_entries"),
      db.outbox,
    ],
    async () => {
      const l = await tbl("food_logs").get(id);
      if (!active(l)) throw new Error("Registro no disponible.");
      const baseTotals=input.items && cat ? recipeNutrition(input.items.map(i=>({...i,note:null})),cat.food,1,1).totals:l.totals;
      const totals = scaleNutrition(baseTotals, input.factor);
      if (input.kcal !== undefined) {
        if (
          input.kcal !== null &&
          (!Number.isFinite(input.kcal) || input.kcal < 0 || input.kcal > 20000)
        )
          throw new Error("Revisa la energía.");
        totals.kcal = input.kcal ?? 0;
        totals.missing = totals.missing.filter(
          (m) => m !== "kcal" && !m.startsWith("kcal:"),
        );
        if (input.kcal === null) totals.missing.push("kcal");
      }
      // Leftover portions are stock items, not raw ingredients: scale their original usage.
      const leftover = l.stockUsage?.some((u) => u.portions);
      if(leftover&&input.items)throw new Error("Corrige las raciones de la sobra, no sus ingredientes.");
      for (const u of l.stockUsage ?? []) {
        const stock = await tbl("pantry_items").get(u.id);
        if (active(stock))
          await patch("pantry_items", u.id, {
            grams: stock.grams + u.grams,
            portions: (stock.portions ?? 0) + (u.portions ?? 0),
          });
      }
      const moved = l.date !== input.date || l.slot !== input.slot;
      if (l.mealEntryId && moved)
        await patch("meal_entries", l.mealEntryId, { status: "planned" });
      await patch("food_logs", id, {
        date: input.date,
        eatenAt: input.eatenAt,
        slot: input.slot,
        title: input.title.trim(),
        totals,
        items: (input.items??l.items).map((i) => ({ ...i, grams: i.grams * input.factor })),
        servings: l.servings ? l.servings * input.factor : null,
        mealEntryId: moved ? null : l.mealEntryId,
        stockUsage: null,
        source: input.kcal !== undefined ? "manual" : input.items ? "calculated" : l.source,
      } as Partial<FoodLog>);
      if (leftover) {
        const usage = [];
        for (const u of l.stockUsage ?? []) {
          const stock = await tbl("pantry_items").get(u.id);
          if (!active(stock)) continue;
          const portions = (u.portions ?? 0) * input.factor;
          if ((stock.portions ?? 0) < portions)
            throw new Error("No quedan suficientes raciones en la despensa.");
          await patch("pantry_items", u.id, {
            portions: (stock.portions ?? 0) - portions,
          });
          usage.push({ ...u, portions });
        }
        await patch("food_logs", id, { stockUsage: usage });
      } else await consumeFoodLog(id);
    },
  );
  await refreshShoppingList(weekStartOf(input.date));
}
