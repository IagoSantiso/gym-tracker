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

export function IngredientSwap({ entry, cat, onClose, initialIndex = 0 }: { initialIndex?: number; entry: MealEntry; cat: Catalog; onClose: () => void }) {
  const prefs = usePreferences();
  const stock = useTable("pantry_items") ?? [];
  const balance = useLive(() => loadDayBalance(entry.date), [entry.date]);
  const [index,setIndex] = useState(initialIndex);
  const [expanded,setExpanded] = useState(false);
  const [query,setQuery] = useState("");
  const [choice,setChoice] = useState<string | null>(null);
  const [ownGrams,setOwnGrams] = useState("");
  const recipe = cat.recipe(entry.recipeId);
  if (!recipe) return null;
  const options = ingredientAlternatives(recipe, index, cat.foods, entry.servings, {
    allergens: [...prefs.allergies, ...prefs.intolerances], excludedFoods: [...prefs.excludedFoods, ...(prefs.foodContext?.avoid ?? [])], stock, date: entry.date,
    projected: balance?.projected, targets: balance?.targets,
  });
  const selected = options.find(o => o.food.id === choice);
  const visible = options.filter(o => o.food.name.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"))).slice(0, expanded ? 100 : 5);
  const ingredients = selected ? selected.ingredients.map((i,n) => n === index ? { ...i, grams: Number(ownGrams) * recipe.servings / entry.servings } : i) : recipe.ingredients;
  const old = recipeNutrition(recipe.ingredients, cat.food, entry.servings, recipe.servings).totals;
  const finalIngredients = choice === "same" ? recipe.ingredients.map((i,n) => n === index ? { ...i, grams: Number(ownGrams) * recipe.servings / entry.servings } : i) : ingredients;
  const totals = recipeNutrition(finalIngredients, cat.food, entry.servings, recipe.servings).totals;
  const oldName = cat.food(recipe.ingredients[index].foodId)?.name ?? "Ingrediente";
  const delta = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v)}`;
  return <Modal open title="Variar este plato" onClose={onClose}>
    <div className="stack"><p className="small">Elige un ingrediente. Las alternativas y cantidades se calculan sin usar IA.</p>
      <div className="ingredient-chips">{recipe.ingredients.map((i,n) => <button className={n === index ? "chip active" : "chip"} aria-pressed={n === index} key={n} onClick={() => { setIndex(n); setChoice(null); setQuery(""); }}>{cat.food(i.foodId)?.name ?? i.foodId}</button>)}</div>
      <Field label={`Cantidad de ${oldName} en este plato (g)`}><input type="number" min="1" max="2000" value={choice === "same" ? ownGrams : Math.round(recipe.ingredients[index].grams * entry.servings / recipe.servings)} onChange={e => {setChoice("same");setOwnGrams(e.target.value);}} /></Field>
      <h3>En lugar de este ingrediente</h3>
      {expanded && <Field label="Buscar alternativas"><input value={query} onChange={e => setQuery(e.target.value)} /></Field>}
      {!visible.length && <Notice>No hay alternativas compatibles en el catálogo. Puedes añadir un producto por su etiqueta o pedir ayuda al asistente.</Notice>}
      <div className="list">{visible.map(o => <button className={choice === o.food.id ? "li ingredient-option selected" : "li ingredient-option"} key={o.food.id} onClick={() => { setChoice(o.food.id); setOwnGrams(String(Math.round(o.grams * entry.servings / recipe.servings))); }}>
        <span className="grow"><b>{o.food.name}</b><span className="s">{Math.round(o.grams * entry.servings / recipe.servings)} g · {o.food.state === "raw" ? "peso en crudo" : o.food.state === "cooked" ? "peso cocinado" : "tal como se vende"}</span><span className="xs">{o.reasons.join(" · ")}</span><span className="s">{delta(o.delta.kcal)} kcal · {delta(o.delta.carbsAvailableG)} g hidratos</span></span>
      </button>)}</div>
      {!expanded && <button className="btn" onClick={() => setExpanded(true)}>Ver más alternativas del catálogo</button>}
      {selected && <><Field label="Cantidad elegida para tu plato (g)"><input type="number" min="1" max="2000" value={ownGrams} onChange={e => setOwnGrams(e.target.value)} /></Field>
        <div className="swap-preview" aria-live="polite"><b>Así queda tu plato</b><p>{Math.round(totals.kcal)} kcal · {Math.round(totals.proteinG)} g proteína · {Math.round(totals.carbsAvailableG)} g hidratos · {Math.round(totals.fatG)} g grasa</p>
        <p className="small">Cambio: {delta(totals.kcal-old.kcal)} kcal · {delta(totals.carbsAvailableG-old.carbsAvailableG)} g hidratos · {delta(totals.fatG-old.fatG)} g grasa</p>
        {balance && <p className="small">Día previsto con este cambio: {Math.round(balance.projected.kcal + totals.kcal - old.kcal)} kcal · {Math.round(balance.projected.proteinG + totals.proteinG - old.proteinG)} g proteína · {Math.round(balance.projected.fatG + totals.fatG - old.fatG)} g grasa. {balance.exerciseToday.map(e => e.label).join(" · ")}</p>}</div>
        {Math.abs(totals.carbsAvailableG-old.carbsAvailableG) > 5 && <Notice>Este cambio modifica los hidratos de la comida. Revísalo con tu pauta personal antes de aplicarlo.</Notice>}
        {selected.cookingChanged && <Notice>Se guardará una receta con preparación por componentes adaptada a los ingredientes elegidos. Revisa el envase y los pasos nuevos; no se reutilizan los tiempos del ingrediente anterior.</Notice>}
        <ActionButton className="btn primary" disabled={!ownGrams || Number(ownGrams)<=0 || Number(ownGrams)>2000 || !Number.isFinite(Number(ownGrams))} onRun={async () => { await applyIngredientVariant(entry.id, entry.recipeId, ingredients, `${recipe.name} · con ${selected.food.name}`, variantSteps(ingredients, cat.food)); onClose(); }} success="Variante guardada para este día">Aplicar a esta comida</ActionButton></>}
      {choice === "same" && <><Notice>Nuevo plato: {Math.round(totals.kcal)} kcal · {Math.round(totals.carbsAvailableG)} g hidratos. Cambio de hidratos: {delta(totals.carbsAvailableG-old.carbsAvailableG)} g.</Notice><ActionButton className="btn primary" disabled={!ownGrams || Number(ownGrams)<=0 || Number(ownGrams)>2000} onRun={async () => { await applyIngredientVariant(entry.id, entry.recipeId, recipe.ingredients.map((i,n) => n === index ? { ...i, grams: Number(ownGrams)*recipe.servings/entry.servings, note: null } : i), `${recipe.name} · a mi medida`, recipe.steps); onClose(); }} success="Cantidad personalizada">Guardar mi cantidad</ActionButton></>}
      <Link className="btn ghost" href={"/asistente?q=" + encodeURIComponent(`Quiero variar la comida ${entry.slot} del ${entry.date}: ${recipe.name}. No tengo ${oldName}. Consulta mi inventario, preferencias de compra y balance del día para proponer una variante y lo mínimo que comprar.`)}>Buscar otra solución con el asistente</Link>
    </div>
  </Modal>;
}
