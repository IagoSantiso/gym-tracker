"use client";
import { useState } from "react";
import Link from "next/link";
import { ActionButton, Field, Modal } from "@/components/ui";
import { usePreferences, useTable } from "@/lib/db/hooks";
import type { MealEntry } from "@/lib/db/types";
import { eligibleRecipes, swapOptions } from "@/lib/domain/nutrition/menu";
import { coverage, stockGrams } from "@/lib/domain/nutrition/kitchen";
import { swapMeal, type Catalog } from "@/lib/services/nutrition";
import { IngredientSwap } from "./IngredientSwap";

/** One entry point for all meal changes, also used directly from Today. */
export function MealChange({ entry, cat, initialIndex, onClose }: { entry: MealEntry; cat: Catalog; initialIndex?: number; onClose: () => void }) {
  const [mode, setMode] = useState<"choose" | "ingredient" | "recipe" | "stock">(initialIndex == null ? "choose" : "ingredient");
  const [query, setQuery] = useState("");
  const [allOptions, setAllOptions] = useState(false);
  const prefs = usePreferences();
  const recipePrefs = useTable("recipe_prefs") ?? [];
  const pantry = useTable("pantry_items") ?? [];
  const current = cat.recipe(entry.recipeId);
  if (!current) return null;
  if (mode === "ingredient") return <IngredientSwap entry={entry} cat={cat} initialIndex={initialIndex} onClose={onClose} />;
  const stock = stockGrams(pantry, entry.date);
  const pool = eligibleRecipes(cat.recipes, cat.food, {
    excludedAllergens: [...prefs.allergies, ...prefs.intolerances],
    excludedFoods: [...prefs.excludedFoods, ...(prefs.foodContext?.avoid ?? [])],
    blacklist: recipePrefs.filter(p => p.blacklisted || p.frequency === "never").map(p => p.recipeId),
  }).filter(r => recipePrefs.find(p => p.recipeId === r.id)?.frequency !== "stock_only" || coverage(r.ingredients, stock, entry.servings / r.servings).missing.length === 0);
  const options = swapOptions(current, entry.slot, pool, cat.food, pool.length, entry.servings)
    .map(o => ({...o, stock: coverage(o.recipe.ingredients, stock, entry.servings / o.recipe.servings)}))
    .filter(o => !query || o.recipe.name.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")))
    .filter(o => mode !== "stock" || o.stock.ratio > 0)
    .sort((a,b) => mode === "stock" ? a.stock.missing.length - b.stock.missing.length : 0);
  return <Modal open title={mode === "choose" ? "¿Qué quieres cambiar?" : mode === "stock" ? "Con lo que tienes" : "Elegir otro plato"} onClose={onClose}>
    {mode === "choose" ? <div className="change-choices">
      <p className="small muted">{current.name}</p>
      <button onClick={() => setMode("ingredient")}><b>Un ingrediente</b><span>Cambiarlo o ajustar su cantidad.</span></button>
      <button onClick={() => setMode("recipe")}><b>Otro plato</b><span>Alternativas para esta comida.</span></button>
      <button onClick={() => setMode("stock")}><b>Con lo que tengo</b><span>Priorizar ingredientes de tu cocina.</span></button>
      <p className="xs dim">Estas opciones se calculan en tu dispositivo, sin usar IA.</p>
    </div> : <div className="stack">
      <button className="text-action" onClick={() => setMode("choose")}>← Volver a las opciones</button>
      <Field label="Buscar un plato"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nombre de la receta" /></Field>
      <div className="list">{options.slice(0, allOptions || query ? options.length : 5).map(o => <div className="li" key={o.recipe.id}>
        <div className="grow"><div className="t">{o.recipe.name}</div>
          <div className="s">{Math.round(o.totals.carbsAvailableG)} g hidratos · {Math.round(o.totals.kcal)} kcal</div>
          {mode === "stock" && <div className="xs dim">{o.stock.missing.length ? `Falta: ${o.stock.missing.map(id=>cat.food(id)?.name ?? id).join(", ")}` : "Tienes todos los ingredientes"}</div>}
          {Math.abs(o.dCarbs) > 5 && <div className="xs">Cambia los hidratos: {o.dCarbs > 0 ? "+" : ""}{Math.round(o.dCarbs)} g. Revisa tu pauta personal.</div>}
        </div>
        <ActionButton className="btn sm" onRun={async()=>{await swapMeal(entry.id,o.recipe.id);onClose();}} success="Comida cambiada">Elegir</ActionButton>
      </div>)}</div>
      {!options.length && <p className="small muted">No hay platos compatibles con esta búsqueda. Puedes cambiar un ingrediente o actualizar tus existencias.</p>}
      {options.length > 5 && !allOptions && !query && <button className="btn ghost" onClick={()=>setAllOptions(true)}>Ver más platos</button>}
      {mode === "stock" && <Link href="/nutricion?tab=cocina" className="text-action">Actualizar mi cocina</Link>}
    </div>}
  </Modal>;
}
