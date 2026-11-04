/**
 * Lista de la compra consolidada: suma ingredientes de las comidas previstas (por raciones),
 * descuenta la despensa, agrupa por sección y conserva el estado "comprado" al regenerar.
 */
import type { MealSlot, ShoppingItem, ShopSection } from "@/lib/db/types";
import type { FoodLike } from "./calc";
import type { RecipeLike } from "./menu";

export interface MealRef {
  recipeId: string;
  servings: number;
  status?: string;
  leftoverOf?: string | null;
  slot?: MealSlot;
}

export function buildShoppingList(
  meals: MealRef[],
  recipes: (id: string) => RecipeLike | undefined,
  foods: (id: string) => FoodLike | undefined,
  pantry: { foodId: string; grams: number }[] = [],
  previous: ShoppingItem[] = [],
): ShoppingItem[] {
  const need = new Map<string, number>();
  for (const m of meals) {
    if (m.status === "eaten" || m.status === "skipped" || m.status === "replaced" || m.leftoverOf) continue;
    const r = recipes(m.recipeId);
    if (!r) continue;
    const k = m.servings / r.servings;
    for (const ing of r.ingredients) need.set(ing.foodId, (need.get(ing.foodId) ?? 0) + ing.grams * k);
  }
  // Las sobras sí requieren comprar sus raciones (se cocinan en el lote anterior)
  for (const m of meals) {
    if (!m.leftoverOf || ["skipped", "replaced", "eaten"].includes(m.status ?? "")) continue;
    const r = recipes(m.recipeId);
    if (!r) continue;
    for (const ing of r.ingredients) need.set(ing.foodId, (need.get(ing.foodId) ?? 0) + (ing.grams * m.servings) / r.servings);
  }
  const pantryBy = new Map<string, number>();
  pantry.forEach((p) => pantryBy.set(p.foodId, (pantryBy.get(p.foodId) ?? 0) + p.grams));
  const prevChecked = new Map(previous.map((p) => [p.key, p.checked]));
  const items: ShoppingItem[] = [];
  for (const [foodId, grams] of need) {
    const f = foods(foodId);
    const key = foodId;
    const pg = Math.min(grams, pantryBy.get(foodId) ?? 0);
    items.push({
      key, foodId, name: f?.name ?? foodId, section: (f?.section ?? "otros") as ShopSection,
      grams: Math.ceil(grams), pantryGrams: Math.round(pg), checked: prevChecked.get(key) ?? false,
    });
  }
  return items.sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name, "es"));
}

/** Texto de cantidad legible ("≈ 3 unidades · 150 g"). */
export function quantityLabel(grams: number, food?: FoodLike): string {
  const g = grams >= 1000 ? `${(grams / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} kg` : `${Math.round(grams)} g`;
  const unit = food?.unitWeights && Object.entries(food.unitWeights)[0];
  if (unit && ["unidad", "lata", "rebanada"].includes(unit[0])) {
    const n = Math.ceil((grams / unit[1]) * 2) / 2;
    return `≈ ${n.toLocaleString("es-ES")} ${unit[0]}${n > 1 ? (unit[0].endsWith("d") ? "es" : "s") : ""} · ${g}`;
  }
  return g;
}

export function toCsv(items: ShoppingItem[], sectionLabel: (s: ShopSection) => string): string {
  const rows = [["Sección", "Producto", "Gramos", "En despensa (g)", "A comprar (g)", "Comprado"]];
  for (const i of items) rows.push([sectionLabel(i.section), i.name, String(i.grams), String(i.pantryGrams), String(Math.max(0, i.grams - i.pantryGrams)), i.checked ? "sí" : "no"]);
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
}
