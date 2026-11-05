import { beforeEach,afterEach,it,expect } from "vitest";
import { NexoDB,setDbForTests,tbl } from "@/lib/db/db";
import { ensureInitialized,resetInitForTests } from "@/lib/db/init";
import { put,patch,all } from "@/lib/db/repo";
import { registerDueMeals } from "@/lib/services/meal-schedule";
import { swapMeal,markEaten } from "@/lib/services/nutrition";
import { deleteFoodLog } from "@/lib/services/kitchen";
let db:NexoDB;
beforeEach(async()=>{db=new NexoDB(`schedule-${crypto.randomUUID()}`);setDbForTests(db);resetInitForTests();await db.open();await ensureInitialized();await patch("profiles","me",{timezone:"UTC"});});
afterEach(async()=>{await db.delete();setDbForTests(null);});
async function entry(){return put("meal_entries",{date:"2026-11-05",slot:"breakfast",recipeId:"tostadas-huevo-tomate",mealPlanId:"test",servings:1,locked:true,status:"planned"});}
it("registers due menu meals once, labels assumption and never recreates deleted meals",async()=>{
 const e=await entry();await registerDueMeals(Date.parse("2026-11-05T07:59:00Z"));expect(await all("food_logs")).toHaveLength(0);
 await registerDueMeals(Date.parse("2026-11-05T08:00:00Z"));await registerDueMeals(Date.parse("2026-11-05T09:00:00Z"));
 const logs=await all("food_logs");expect(logs).toHaveLength(1);expect(logs[0].source).toBe("estimated");expect(logs[0].mealEntryId).toBe(e.id);
 await deleteFoodLog(logs[0].id);await registerDueMeals(Date.parse("2026-11-05T12:00:00Z"));expect(await all("food_logs")).toHaveLength(0);
});
it("allows changing a locked completed meal and updates its sole diary snapshot",async()=>{
 const e=await entry();await markEaten(e);await swapMeal(e.id,"avena-yogur-frutos-rojos");
 const logs=await all("food_logs");expect(logs).toHaveLength(1);expect(logs[0].recipeId).toBe("avena-yogur-frutos-rojos");expect(logs[0].title).toMatch(/Avena/);expect((await tbl("meal_entries").get(e.id))?.locked).toBe(false);
});
