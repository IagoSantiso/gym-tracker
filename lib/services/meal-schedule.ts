import { tbl } from "@/lib/db/db";
import { active, all, patch } from "@/lib/db/repo";
import { localDate, localTime, zonedWallToUtc } from "@/lib/domain/time";
import { mealIsDue, MEAL_HOURS } from "@/lib/domain/nutrition/schedule";
import { loadCatalog, markEaten } from "./nutrition";
import { editMeal } from "./diary";

/** Called by the shell, never inside a live query. Idempotent through markEaten's serial lock. */
export async function registerDueMeals(now=Date.now()) {
 const p=await tbl("profiles").get("me");const tz=p?.timezone??"Europe/Madrid";
 const date=localDate(now,tz),hour=Number(localTime(now,tz).split(":")[0]);
 const entries=(await tbl("meal_entries").where("date").equals(date).toArray()).filter(e=>active(e)&&e.status==="planned"&&mealIsDue(e.slot,hour));
 for(const e of entries){
  // Check even deleted logs: an intentional deletion must not be recreated by the clock.
  if((await tbl("food_logs").where("date").equals(date).toArray()).some(l=>l.mealEntryId===e.id))continue;
  const log=await markEaten(e);if(!log)continue;
  const [year,month,day]=date.split("-").map(Number);
  await patch("food_logs",log.id,{source:"estimated",note:"Asumida del menú por horario; edita o elimina si no coincide con lo comido.",eatenAt:new Date(zonedWallToUtc({year,month,day,hour:MEAL_HOURS[e.slot],minute:0},tz).ms).toISOString()});
 }
}
/** A correction changes the existing diary snapshot, never creates a second meal. */
export async function syncMealRecord(entryId:string) {
 const e=await tbl("meal_entries").get(entryId);if(!active(e))return;
 const log=(await all("food_logs")).find(l=>l.mealEntryId===e.id);if(!log)return;
 const cat=await loadCatalog(),recipe=cat.recipe(e.recipeId);if(!recipe)return;
 await editMeal(log.id,{title:recipe.name,date:log.date,eatenAt:log.eatenAt,slot:log.slot,factor:1,items:recipe.ingredients.map(i=>({foodId:i.foodId,grams:i.grams*e.servings/recipe.servings}))});
 await patch("food_logs",log.id,{recipeId:e.recipeId,servings:e.servings,source:log.source==="estimated"?"estimated":"calculated"});
 await patch("meal_entries",e.id,{status:"eaten",locked:false});
}
