import type { PantryItem, RecipeIngredientData } from "@/lib/db/types";
import { availableCarbsPer100, nutrientsFor, recipeNutrition, type FoodLike } from "./calc";
import type { RecipeLike } from "./menu";

export type Stock = Pick<PantryItem, "foodId" | "grams" | "quantityKnown" | "useBy" | "location" | "recipeId" | "portions">;
export const usableStock = (s: Stock, date: string) => !s.useBy || s.useBy >= date;
export function stockGrams(stock: Stock[], date: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of stock) if (usableStock(s, date) && s.quantityKnown !== false && !s.recipeId)
    out.set(s.foodId, (out.get(s.foodId) ?? 0) + Math.max(0, s.grams));
  return out;
}
export function coverage(ingredients: RecipeIngredientData[], stock: Map<string, number>, factor = 1) {
  const need = new Map<string, number>();
  ingredients.forEach(i => need.set(i.foodId, (need.get(i.foodId) ?? 0) + i.grams * factor));
  const missing = [...need].filter(([id, g]) => (stock.get(id) ?? 0) + 0.5 < g).map(([id]) => id);
  return { missing, ratio: need.size ? (need.size - missing.length) / need.size : 0 };
}

/** Culinary groups deliberately prevent a numeric match such as oil for salmon. */
export function foodRole(f: FoodLike): string {
  const id = f.id;
  const name = f.name.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/pollo|ternera|cerdo|salmon|bacalao|lubina|dorada|jamon|atun|sardina|tofu|huevo|pavo/.test(name)) return "protein";
  if (/leche|yogur|queso|mozzarella/.test(name)) return "dairy";
  if (/arroz|pasta|pan |avena|patata|boniato|quinoa|cuscus/.test(name)) return "starch";
  if (/^(chicken|beef|pork|salmon|cod|hake|seabass|seabream|ham|tuna|sardines|tofu|egg)/.test(id) || f.section === "carne_pescado") return "protein";
  if (/^(milk|yogurt|greek_yogurt|cottage|mozzarella)/.test(id)) return "dairy";
  if (/^(rice|pasta|bread|oats|potato|sweet_potato|quinoa|couscous)/.test(id)) return "starch";
  if (/^(lentils|chickpeas|white_beans|edamame)/.test(id)) return "legume";
  if (/^(olive_oil|almonds|walnuts|peanut_butter|avocado|chia)/.test(id)) return "fat";
  if (/^(banana|apple|orange|strawberries|blueberries|kiwi)/.test(id)) return "fruit";
  if (f.section === "fruta_verdura") return "vegetable";
  return "other";
}
export interface AlternativeContext {
  allergens: string[]; excludedFoods: string[]; stock: Stock[]; date: string;
  projected?: { kcal: number; proteinG: number; fatG: number };
  targets?: { kcal: [number, number] | null; proteinG: [number, number] | null; fatG: [number, number] | null };
}
function cookingFamily(f: FoodLike): string {
  if (/^bread/.test(f.id) || /\bpan\b/i.test(f.name)) return "bread";
  if (/^oats/.test(f.id) || /avena/i.test(f.name)) return "oats";
  if (/^potato|^sweet_potato/.test(f.id)) return "tuber";
  if (/broccoli|green_beans|zucchini|mushrooms/.test(f.id)) return "cooked-vegetable";
  return foodRole(f);
}
export function ingredientAlternatives(recipe: RecipeLike, index: number, foods: FoodLike[], servings: number, ctx: AlternativeContext) {
  const ing = recipe.ingredients[index];
  const from = foods.find(f => f.id === ing?.foodId);
  if (!from || !ing) return [];
  const byId = (id: string) => foods.find(f => f.id === id);
  const base = recipeNutrition(recipe.ingredients, byId, servings, recipe.servings).totals;
  const role = foodRole(from);
  const stock = stockGrams(ctx.stock, ctx.date);
  const axis = (f: FoodLike) => role === "protein" || role === "legume" ? f.per100.proteinG : role === "starch" || role === "fruit" ? availableCarbsPer100(f.per100, f.carbBasis) : role === "fat" ? f.per100.fatG : f.per100.kcal;
  const a = axis(from);
  if (a == null || a <= 0) return [];
  const distance = (value: number, range: [number, number] | null) => !range ? 0 : Math.max(range[0] - value, value - range[1], 0) / Math.max(1, range[1]);
  return foods.filter(f => f.id !== from.id && foodRole(f) === role && role !== "other")
    .filter(f => !["starch", "vegetable"].includes(role) || cookingFamily(f) === cookingFamily(from))
    .filter(f => !f.allergens.some(x => ctx.allergens.includes(x)))
    .filter(f => !ctx.excludedFoods.some(x => x.trim() && (f.id === x || f.name.toLocaleLowerCase("es").includes(x.trim().toLocaleLowerCase("es")))))
    .filter(f => f.state === from.state || (role !== "protein" && role !== "starch"))
    .flatMap(f => {
      const b = axis(f);
      if (b == null || b <= 0 || f.per100.kcal == null || f.per100.fatG == null || f.per100.proteinG == null || availableCarbsPer100(f.per100, f.carbBasis) == null) return [];
      let grams = Math.round(ing.grams * a / b / 5) * 5;
      if (f.unitWeights?.unidad && /^(egg|yogurt)/.test(f.id)) grams = Math.max(f.unitWeights.unidad, Math.round(grams / f.unitWeights.unidad) * f.unitWeights.unidad);
      if (grams < 5 || grams > Math.min(600, ing.grams * 3)) return [];
      const ingredients = recipe.ingredients.map((i, n) => n === index ? { foodId: f.id, grams, note: null } : { ...i });
      const totals = recipeNutrition(ingredients, byId, servings, recipe.servings).totals;
      const delta = { kcal: totals.kcal - base.kcal, proteinG: totals.proteinG - base.proteinG, fatG: totals.fatG - base.fatG, carbsAvailableG: totals.carbsAvailableG - base.carbsAvailableG };
      const enough = (stock.get(f.id) ?? 0) >= grams * servings / recipe.servings;
      let score = Math.abs(delta.kcal) / 100 + Math.abs(delta.fatG) / 10 + Math.abs(delta.carbsAvailableG) / 10 + (enough ? -1 : 0);
      if (ctx.projected && ctx.targets) for (const key of ["kcal", "proteinG", "fatG"] as const) score += 4 * distance(ctx.projected[key] + delta[key], ctx.targets[key]);
      const reasons = [enough ? "Lo tienes en casa" : "Revisa existencias", role === "protein" ? "Cantidad ajustada por proteína" : "Cantidad ajustada al ingrediente"];
      if (Math.abs(delta.fatG) > 3) reasons.push(`${delta.fatG > 0 ? "+" : ""}${Math.round(delta.fatG)} g de grasa en el plato`);
      return [{ food: f, grams, ingredients, totals, delta, enough, score, reasons, cookingChanged: true }];
    }).sort((a, b) => a.score - b.score || a.food.name.localeCompare(b.food.name, "es"));
}

/** Standard component preparation replaces the original ingredient's instructions and times. */
export function variantSteps(ingredients: RecipeIngredientData[], food: (id: string) => FoodLike | undefined): string[] {
  const fs = ingredients.flatMap(i => food(i.foodId) ? [food(i.foodId)!] : []);
  const steps = ["Pesa los ingredientes en el estado indicado. Las cantidades de aceite y leche son las del plato completo."];
  const rawProtein = fs.filter(f => foodRole(f) === "protein" && f.state === "raw");
  if (rawProtein.length) steps.push(`Prepara por separado ${rawProtein.map(f=>f.name.toLowerCase()).join(", ")}. Cocina completamente, siguiendo las indicaciones del producto y separando los utensilios del alimento crudo de los del resto. No uses los tiempos del ingrediente sustituido.`);
  if (fs.some(f=>cookingFamily(f)==="bread")) steps.push("Tuesta el pan indicado; reparte encima el acompañamiento o sírvelo al lado.");
  const starch = fs.filter(f => foodRole(f) === "starch" && cookingFamily(f) !== "bread" && f.state !== "cooked");
  if (starch.length) steps.push(`Cuece o prepara ${starch.map(f=>f.name.toLowerCase()).join(", ")} según su envase; no intercambies pesos en crudo y cocinado.`);
  const cookedVeg = fs.filter(f => cookingFamily(f)==="cooked-vegetable");
  if (cookedVeg.length) steps.push(`Lava y cocina ${cookedVeg.map(f=>f.name.toLowerCase()).join(", ")} al vapor o salteado, usando parte del aceite indicado.`);
  const freshVeg = fs.filter(f => foodRole(f)==="vegetable" && cookingFamily(f)!=="cooked-vegetable");
  if (freshVeg.length) steps.push(`Lava y corta ${freshVeg.map(f=>f.name.toLowerCase()).join(", ")}; sírvelo como acompañamiento o añádelo al final.`);
  if (fs.some(f=>f.state === "cooked" || ["tuna_water","sardines_oil","ham_cooked"].includes(f.id))) steps.push("Sirve o calienta los alimentos ya cocinados y listos para consumo según su envase. Si el catálogo indica escurrido, pésalo después de escurrir.");
  if (fs.some(f=>f.id === "coffee_brewed")) steps.push("Prepara el café y añade la leche indicada, si la hay. Se contabiliza también la leche del café.");
  steps.push("Combina los componentes y sirve con el resto de ingredientes en las cantidades indicadas. Revisa las instrucciones del producto si requiere preparación especial.");
  return steps;
}

export function consumption(stock: PantryItem[], items: { foodId: string; grams: number }[], date: string) {
  const remaining = new Map<string, number>();
  items.forEach(i => remaining.set(i.foodId, (remaining.get(i.foodId) ?? 0) + i.grams));
  const changes: { id: string; before: number; after: number }[] = [];
  for (const s of [...stock].filter(s => usableStock(s, date) && s.quantityKnown !== false && !s.recipeId).sort((a,b) => (a.useBy || "9999").localeCompare(b.useBy || "9999"))) {
    const take = Math.min(Math.max(0, s.grams), remaining.get(s.foodId) ?? 0);
    if (take > 0) { changes.push({ id: s.id, before: s.grams, after: s.grams - take }); remaining.set(s.foodId, remaining.get(s.foodId)! - take); }
  }
  return changes;
}
