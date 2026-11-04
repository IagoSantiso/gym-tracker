"use client";
import { useState } from "react";
import Link from "next/link";
import { ActionButton, Field, Modal, Notice } from "@/components/ui";
import { useLive, usePreferences, useTable } from "@/lib/db/hooks";
import type { MealEntry } from "@/lib/db/types";
import { ingredientAlternatives, variantSteps } from "@/lib/domain/nutrition/kitchen";
import { recipeNutrition } from "@/lib/domain/nutrition/calc";
import { applyIngredientVariant } from "@/lib/services/kitchen";
import { loadDayBalance } from "@/lib/services/balance";
import type { Catalog } from "@/lib/services/nutrition";

export function IngredientSwap({entry,cat,onClose,initialIndex=0}: {initialIndex?:number;entry:MealEntry;cat:Catalog;onClose:()=>void}) {
  const prefs=usePreferences();
  const stock=useTable("pantry_items")??[];
  const balance=useLive(()=>loadDayBalance(entry.date),[entry.date]);
  const [index,setIndex]=useState(initialIndex);
  const [expanded,setExpanded]=useState(false);
  const [query,setQuery]=useState("");
  const [choice,setChoice]=useState<string|null>(null);
  const [grams,setGrams]=useState("");
  const recipe=cat.recipe(entry.recipeId);
  if(!recipe)return null;
  const options=ingredientAlternatives(recipe,index,cat.foods,entry.servings,{allergens:[...prefs.allergies,...prefs.intolerances],excludedFoods:[...prefs.excludedFoods,...(prefs.foodContext?.avoid??[])],stock,date:entry.date,projected:balance?.projected,targets:balance?.targets});
  const selected=options.find(o=>o.food.id===choice);
  const same=choice==="same";
  const ingredients=(selected?.ingredients??recipe.ingredients).map((i,n)=>n===index && (selected||same)?{...i,grams:Number(grams)*recipe.servings/entry.servings,note:null}:i);
  const before=recipeNutrition(recipe.ingredients,cat.food,entry.servings,recipe.servings).totals;
  const after=recipeNutrition(ingredients,cat.food,entry.servings,recipe.servings).totals;
  const oldName=cat.food(recipe.ingredients[index].foodId)?.name??"Ingrediente";
  const actualGrams=Math.round(recipe.ingredients[index].grams*entry.servings/recipe.servings);
  const visible=options.filter(o=>o.food.name.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"))).slice(0,expanded?100:4);
  const delta=(v:number)=>`${v>=0?"+":""}${Math.round(v)}`;
  const valid=grams!=="" && Number.isFinite(Number(grams)) && Number(grams)>0 && Number(grams)<=2000;
  const reset=()=>{setChoice(null);setGrams("");};
  return <Modal open title="Cambiar ingrediente" onClose={onClose} footer={selected||same ? <div className="swap-footer"><ActionButton className="btn primary" disabled={!valid} onRun={async()=>{await applyIngredientVariant(entry.id,entry.recipeId,ingredients,same?`${recipe.name} · a mi medida`:`${recipe.name} · con ${selected!.food.name}`,same?recipe.steps:variantSteps(ingredients,cat.food));onClose();}} success="Variante guardada para este día">Aplicar a esta comida</ActionButton></div> : undefined}>
    <div className="stack">
      <Field label="Ingrediente a cambiar"><select value={index} onChange={e=>{setIndex(Number(e.target.value));reset();setQuery("");}}>{recipe.ingredients.map((i,n)=><option key={n} value={n}>{cat.food(i.foodId)?.name??i.foodId}</option>)}</select></Field>
      <p className="xs dim">Cantidad actual: {actualGrams} g. Las alternativas se calculan sin IA.</p>
      {selected||same ? <>
        <div className="swap-selection"><span className="xs dim">{same?"Mismo ingrediente":"En su lugar"}</span><b>{selected?.food.name??oldName}</b><button className="text-action" onClick={reset}>Elegir otra alternativa</button></div>
        <Field label="Cantidad para tu plato (g)"><input type="number" min="1" max="2000" value={grams} onChange={e=>setGrams(e.target.value)} /></Field>
        <div className="swap-preview" aria-live="polite"><b>Así queda tu plato</b><p>{Math.round(after.carbsAvailableG)} g hidratos · {Math.round(after.kcal)} kcal</p><p className="small">Cambio: {delta(after.carbsAvailableG-before.carbsAvailableG)} g hidratos · {delta(after.kcal-before.kcal)} kcal{Math.abs(after.fatG-before.fatG)>=5?` · ${delta(after.fatG-before.fatG)} g grasa`:""}</p></div>
        {Math.abs(after.carbsAvailableG-before.carbsAvailableG)>5 && <Notice>El cambio modifica los hidratos. Revísalo con tu pauta personal antes de aplicarlo.</Notice>}
        {after.missing.length>0 && <p className="xs dim">Algunos datos nutricionales están incompletos.</p>}
        <details className="quiet-disclosure"><summary>Efecto en el día y preparación</summary><div className="stack"><p className="small">Plato: {Math.round(after.proteinG)} g proteína · {Math.round(after.fatG)} g grasa.</p>
          {balance && <p className="small">Día previsto: {Math.round(balance.projected.kcal+after.kcal-before.kcal)} kcal · {Math.round(balance.projected.proteinG+after.proteinG-before.proteinG)} g proteína · {Math.round(balance.projected.fatG+after.fatG-before.fatG)} g grasa. {balance.exerciseToday.map(e=>e.label).join(" · ")}</p>}
          {!same && <><p className="small muted">La preparación cambia con los ingredientes. Revisa las indicaciones del producto.</p><ol className="small recipe-steps">{variantSteps(ingredients,cat.food).map((step,i)=><li key={i}>{step}</li>)}</ol></>}
        </div></details>
      </> : <>
        <h3>Alternativas</h3>
        {expanded && <Field label="Buscar alternativas"><input value={query} onChange={e=>setQuery(e.target.value)} /></Field>}
        {!visible.length && <p className="small muted">No hay alternativas compatibles en el catálogo.</p>}
        <div className="list">{visible.map(o=><button className="ingredient-option" key={o.food.id} onClick={()=>{setChoice(o.food.id);setGrams(String(Math.round(o.grams*entry.servings/recipe.servings)));}}><span className="grow"><b>{o.food.name}</b><span className="s">{Math.round(o.grams*entry.servings/recipe.servings)} g · {o.food.state==="raw"?"en crudo":o.food.state==="cooked"?"cocinado":"tal como se vende"}{o.enough?" · lo tienes":""}</span><span className="xs dim">{delta(o.delta.carbsAvailableG)} g hidratos · {delta(o.delta.kcal)} kcal</span></span><span aria-hidden>→</span></button>)}</div>
        {!expanded && options.length>4 && <button className="text-action" onClick={()=>setExpanded(true)}>Ver más alternativas</button>}
        <button className="text-action" onClick={()=>{setChoice("same");setGrams(String(actualGrams));}}>Ajustar solo la cantidad</button>
        <details className="quiet-disclosure"><summary>No encuentro lo que necesito</summary><Link className="text-action" href={"/asistente?q="+encodeURIComponent(`Quiero variar la comida ${entry.slot} del ${entry.date}: ${recipe.name}. No tengo ${oldName}. Consulta mi inventario, preferencias de compra y balance del día para proponer una variante.`)}>Pedir ayuda al asistente</Link></details>
      </>}
    </div>
  </Modal>;
}
