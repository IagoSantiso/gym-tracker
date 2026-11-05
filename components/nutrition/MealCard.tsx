"use client";
import { EditFoodModal } from "./FoodDiary";
import { useLive } from "@/lib/db/hooks";
import { active, all } from "@/lib/db/repo";
import { MEAL_HOURS } from "@/lib/domain/nutrition/schedule";
import { useState } from "react";
import { ActionButton, Icon } from "@/components/ui";
import { patch } from "@/lib/db/repo";
import type { MealEntry } from "@/lib/db/types";
import { absorptionHint, recipeNutrition } from "@/lib/domain/nutrition/calc";
import { SLOT_LABEL } from "@/lib/domain/nutrition/recipes";
import { markEaten, restoreMeal, type Catalog } from "@/lib/services/nutrition";
import { NutrientLine, Portions } from "./MealDetails";
import { MealChange } from "./MealChange";

export function MealRow({ e, cat, featured = false, openPortions = false }: { e: MealEntry; cat: Catalog; featured?: boolean; openPortions?: boolean; onSwap?: () => void }) {
  const [change, setChange] = useState<number | null | undefined>(undefined);
  const [editing,setEditing]=useState(false);
  const log=useLive(async()=>(await all("food_logs")).find(l=>l.mealEntryId===e.id),[e.id]);
  const r = cat.recipe(e.recipeId);
  if (!r) return null;
  const totals = recipeNutrition(r.ingredients, cat.food, e.servings, r.servings).totals;
  const hint = absorptionHint(totals);
  return <article className={`meal-card${featured ? " featured" : ""}`} data-status={e.status}>
    <div className="meal-meta"><span>{SLOT_LABEL[e.slot]}{featured ? " · por preparar" : ""}</span>{e.status === "eaten" ? <span>Registrada</span> : e.status === "replaced" ? <span>Sustituida por tu registro</span> : e.status === "skipped" ? <span>Omitida</span> : <span>{MEAL_HOURS[e.slot]}:00 · anotación automática</span>}</div>
    <h3 className="meal-name">{r.name}</h3>
    <p className="meal-carbs"><b>{Math.round(totals.carbsAvailableG)} g</b> de hidratos{e.servings !== 1 ? ` · ${e.servings.toLocaleString("es-ES")} raciones` : ""}</p>
    <details className="meal-details" open={openPortions && e.status === "planned"}>
      <summary>Ingredientes y detalles</summary>
      <div className="stack"><Portions recipeIngredients={r.ingredients} cat={cat} servings={e.servings} baseServings={r.servings} open onIngredient={n=>setChange(n)} />
        <ol className="small recipe-steps">{r.steps.map((step,i)=><li key={i}>{step}</li>)}</ol>
        <NutrientLine t={totals} />
        {hint && <p className="xs dim">{hint}</p>}{e.notes && <p className="xs dim">{e.notes}</p>}
      {e.status === "planned" && <details className="meal-more"><summary>Más opciones</summary><div className="row">

        <ActionButton className="btn sm ghost" onRun={()=>patch("meal_entries",e.id,{status:"skipped"})} success="Comida omitida">Omitir del menú</ActionButton>
        {e.replacedFrom && <ActionButton className="btn sm ghost" onRun={()=>restoreMeal(e.id)} success="Receta anterior restaurada">Deshacer cambio</ActionButton>}
      </div></details>}
      </div>
    </details>
    <div className="meal-actions no-print">
      {log && <button className="btn sm" onClick={()=>setEditing(true)}>Editar registro</button>}
      <button className="btn sm" onClick={()=>setChange(null)}>Cambiar</button>
      {e.status === "planned" && <><ActionButton className="btn sm primary" onRun={()=>markEaten(e)} success="Comida registrada">Hecha</ActionButton></>}
      {(e.status === "skipped" || e.status === "replaced") && <ActionButton className="btn sm" onRun={()=>patch("meal_entries",e.id,{status:"planned"})} success="Comida recuperada">Recuperar</ActionButton>}

    </div>
    {editing && log && <EditFoodModal log={log} onClose={()=>setEditing(false)}/>}
    {change !== undefined && <MealChange entry={e} cat={cat} initialIndex={change ?? undefined} onClose={()=>setChange(undefined)} />}
  </article>;
}
