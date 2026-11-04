import type { MealSlot } from "@/lib/db/types";
import { SLOT_ORDER } from "@/lib/domain/nutrition/recipes";

/** A display preference only: never treats an unlogged meal as eaten or skipped. */
export function currentMeal<T extends { slot: MealSlot; status: string }>(meals: T[], loggedSlots: MealSlot[], localMinutes: number): T | undefined {
  const pending = meals.filter(m => m.status === "planned" && !loggedSlots.includes(m.slot));
  const preferred: MealSlot = localMinutes < 690 ? "breakfast" : localMinutes < 960 ? "lunch" : localMinutes < 1140 ? "snack" : "dinner";
  const ordered = [...pending].sort((a,b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  return ordered.find(m => m.slot === preferred) ?? ordered.find(m=>SLOT_ORDER.indexOf(m.slot) > SLOT_ORDER.indexOf(preferred)) ?? ordered[0];
}
