import { beforeEach, describe, expect, it } from "vitest";
import { NexoDB, setDbForTests, tbl } from "@/lib/db/db";
import { put } from "@/lib/db/repo";
import { SEED_FOODS, SEED_FOOD_BY_ID } from "@/lib/domain/nutrition/foods";
import { SEED_RECIPES } from "@/lib/domain/nutrition/recipes";
import { consumption, ingredientAlternatives, stockGrams } from "@/lib/domain/nutrition/kitchen";
import { generateMenu, swapOptions, type MenuConstraints } from "@/lib/domain/nutrition/menu";
import { markEaten, loadCatalog } from "@/lib/services/nutrition";
import { consumeFoodLog, undoStockUsage, applyIngredientVariant, eatLeftover } from "@/lib/services/kitchen";
import { executeTool } from "@/lib/ai/client-tools";
import { acceptProposal, revertProposal } from "@/lib/services/plan";

const food = (id: string) => SEED_FOOD_BY_ID[id];
const c: MenuConstraints = { weekStart: "2026-11-02", slots: ["breakfast", "lunch", "dinner"], trainingDates: [], excludedAllergens: [], excludedFoods: [], blacklist: [], favorites: [], maxCookMin: 40, locked: [] };
beforeEach(async () => { const db = new NexoDB(crypto.randomUUID()); setDbForTests(db); await db.open(); });

describe("inventario y sustituciones", () => {
  it("la foto solo crea un borrador y requiere consentimiento y aceptación", async () => {
    const call = { id: "photo", name: "propose_pantry_items", input: { items: [{food_id:"tomato",name:"Tomates",grams:null,location:"fridge",opened:null,use_by:null,evidence:"Visibles en la foto; no se puede pesar."}] } };
    expect((await executeTool(call)).isError).toBe(true);
    for (const kind of ["ai_assistant", "ai_nutrition"] as const) await put("consents",{id:kind,kind,granted:true,version:1});
    expect((await executeTool(call)).isError).not.toBe(true);
    expect(await tbl("pantry_items").count()).toBe(0);
    const proposal = (await tbl("proposals").toArray())[0];
    expect((await acceptProposal(proposal.id)).ok).toBe(true);
    const item = (await tbl("pantry_items").toArray())[0];
    expect(item.quantityKnown).toBe(false);expect(item.grams).toBe(0);
    await revertProposal(proposal.id);
    expect((await tbl("pantry_items").get(item.id))!.deletedAt).toBeTruthy();
  });
  it("no descuenta cantidades desconocidas ni fechas superadas", async () => {
    const old = await put("pantry_items", { foodId: "cod_raw", name: "Bacalao", grams: 200, useBy: "2026-11-01" });
    const unknown = await put("pantry_items", { foodId: "cod_raw", name: "Bacalao", grams: 200, quantityKnown: false });
    expect(stockGrams([old, unknown], "2026-11-04").size).toBe(0);
    expect(consumption([old, unknown], [{foodId:"cod_raw",grams:150}], "2026-11-04")).toEqual([]);
  });
  it("ofrece proteínas compatibles sin confundirlas con grasa o alimentos excluidos", () => {
    const recipe = SEED_RECIPES.find(r => r.id === "bacalao-garbanzos-espinacas")!;
    const list = ingredientAlternatives(recipe, 0, SEED_FOODS, 1.5, { allergens: ["pescado"], excludedFoods: ["ternera"], stock: [], date:"2026-11-04" });
    expect(list.some(x => x.food.id === "chicken_raw")).toBe(true);
    expect(list.some(x => x.food.id === "olive_oil" || x.food.id === "salmon_raw" || x.food.id === "beef_lean_raw")).toBe(false);
    const chicken = list.find(x => x.food.id === "chicken_raw")!;
    expect(chicken.totals.proteinG).toBeGreaterThan(40);
    expect(chicken.cookingChanged).toBe(true);
  });
  it("pondera el efecto en el día y distingue el salmón de las proteínas magras", () => {
    const recipe = SEED_RECIPES.find(r => r.id === "bacalao-garbanzos-espinacas")!;
    const list = ingredientAlternatives(recipe, 0, SEED_FOODS, 1, { allergens:[], excludedFoods:[],stock:[],date:"2026-11-04",projected:{kcal:2200,proteinG:120,fatG:80},targets:{kcal:[2000,2200],proteinG:[100,140],fatG:[50,75]} });
    expect(list.findIndex(x => x.food.id === "chicken_raw")).toBeLessThan(list.findIndex(x => x.food.id === "salmon_raw"));
    expect(list.find(x => x.food.id === "salmon_raw")!.delta.fatG).toBeGreaterThan(10);
  });
  it("rota desayunos aunque haya una favorita", () => {
    const meals = generateMenu(SEED_RECIPES, food, { ...c, favorites: ["avena-yogur-frutos-rojos"] });
    const breakfasts = meals.filter(m => m.slot === "breakfast");
    expect(new Set(breakfasts.map(m=>m.recipeId)).size).toBeGreaterThan(1);
  });
  it("no repite recetas ocasionales y solo planifica existencias una vez", () => {
    const recipe = SEED_RECIPES.find(r => r.id === "bacalao-garbanzos-espinacas")!;
    const occasional = generateMenu([recipe], food, { ...c, frequencies:{[recipe.id]:"occasional"} });
    expect(occasional).toHaveLength(1);
    const stock = recipe.ingredients.map(i=>({...i,quantityKnown:true}));
    expect(generateMenu([recipe], food, { ...c, frequencies:{[recipe.id]:"stock_only"}, stock })).toHaveLength(1);
    const locked = [{date:c.weekStart,slot:"lunch" as const,recipeId:recipe.id,servings:1,reserveStock:false}];
    expect(generateMenu([recipe], food, { ...c, frequencies:{[recipe.id]:"stock_only"}, stock, locked })).toHaveLength(2);
  });
  it("las alternativas de receta comparan la ración real", () => {
    const recipe = SEED_RECIPES[0];
    const one = swapOptions(recipe,"breakfast",SEED_RECIPES,food,20,1);
    const two = swapOptions(recipe,"breakfast",SEED_RECIPES,food,20,2);
    expect(two[0].totals.kcal).toBeCloseTo(one.find(x=>x.recipe.id===two[0].recipe.id)!.totals.kcal * 2);
  });
  it("para tostadas ofrece pan y no copos de avena", () => {
    const r = SEED_RECIPES.find(r=>r.id === "mis-tostadas-omelette-tomato")!;
    const options = ingredientAlternatives(r,0,SEED_FOODS,1,{allergens:[],excludedFoods:[],stock:[],date:"2026-11-04"});
    expect(options.some(o=>o.food.id === "bread_rye")).toBe(true);
    expect(options.some(o=>o.food.id === "oats")).toBe(false);
  });
  it("registrar y descontar dos veces es idempotente; deshacer devuelve existencias", async () => {
    const stock = await put("pantry_items",{foodId:"bread_whole",name:"Pan",grams:200});
    const plan = await put("meal_plans",{weekStart:c.weekStart,generatedAt:new Date().toISOString(),settings:{},generatorVersion:"test"});
    const entry = await put("meal_entries",{mealPlanId:plan.id,date:"2026-11-04",slot:"breakfast",recipeId:"mis-tostadas-omelette-tomato",servings:1,locked:false,status:"planned"});
    const [a,b] = await Promise.all([markEaten(entry),markEaten(entry)]);
    expect(a!.id).toBe(b!.id);
    await consumeFoodLog(a!.id);
    expect((await tbl("pantry_items").get(stock.id))!.grams).toBe(140);
    await undoStockUsage(a!.id); await undoStockUsage(a!.id);
    expect((await tbl("pantry_items").get(stock.id))!.grams).toBe(200);
  });
  it("la variante solo cambia una comida y rechaza aplicar sobre otra versión", async () => {
    const plan = await put("meal_plans",{weekStart:c.weekStart,generatedAt:new Date().toISOString(),settings:{},generatorVersion:"test"});
    const entry = await put("meal_entries",{mealPlanId:plan.id,date:"2026-11-04",slot:"lunch",recipeId:"bacalao-garbanzos-espinacas",servings:1.5,locked:false,status:"planned"});
    const cat = await loadCatalog(); const original = cat.recipe(entry.recipeId)!;
    const ingredients = original.ingredients.map((i,n)=>n === 0 ? {foodId:"chicken_raw",grams:125}:i);
    await applyIngredientVariant(entry.id,entry.recipeId,ingredients,"Pollo con garbanzos",["Cocinar el pollo por separado."]);
    const after = (await tbl("meal_entries").get(entry.id))!;
    expect(after.recipeId).not.toBe(entry.recipeId); expect(after.servings).toBe(1.5);
    expect(cat.recipe(entry.recipeId)!.ingredients[0].foodId).toBe("cod_raw");
    await expect(applyIngredientVariant(entry.id,entry.recipeId,ingredients,"Otra",["Cocinar"])).rejects.toThrow();
  });
  it("comer una sobra no descuenta los ingredientes de nuevo", async () => {
    const bread = await put("pantry_items",{foodId:"bread_whole",name:"Pan",grams:200});
    const leftover = await put("pantry_items",{foodId:"",name:"Tostadas preparadas",grams:0,recipeId:"mis-tostadas-omelette-tomato",portions:2});
    await eatLeftover(leftover.id,"lunch",1);
    expect((await tbl("pantry_items").get(bread.id))!.grams).toBe(200);
    expect((await tbl("pantry_items").get(leftover.id))!.portions).toBe(1);
  });
});
