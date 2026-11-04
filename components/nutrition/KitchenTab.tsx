"use client";
import { useState } from "react";
import Link from "next/link";
import { ActionButton, Card, Empty, Field, Modal, Notice, useToast } from "@/components/ui";
import { useLive, usePreferences, useTable } from "@/lib/db/hooks";
import { patch, remove } from "@/lib/db/repo";
import type { PantryItem } from "@/lib/db/types";
import { eligibleRecipes } from "@/lib/domain/nutrition/menu";
import { coverage, stockGrams } from "@/lib/domain/nutrition/kitchen";
import { localDate, weekStartOf } from "@/lib/domain/time";
import { eatLeftover, saveStock, undoStockUsage } from "@/lib/services/kitchen";
import { refreshShoppingList, type Catalog } from "@/lib/services/nutrition";

const LOCATIONS = { fridge: "Nevera", freezer: "Congelador", pantry: "Despensa" };
export function KitchenTab({ cat }: { cat: Catalog }) {
  const stock = useTable("pantry_items") ?? [];
  const logs = useTable("food_logs") ?? [];
  const prefs = usePreferences();
  const toast = useToast();
  const [editor, setEditor] = useState<PantryItem | "new" | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const today = localDate();
  const list = stock.filter(p => p.name.toLocaleLowerCase("es").includes(q.toLocaleLowerCase("es")) && (filter === "all" || filter === "soon" && p.useBy && p.useBy <= today || (p.location ?? "pantry") === filter));
  const rp = useTable("recipe_prefs") ?? [];
  const ready = eligibleRecipes(cat.recipes, cat.food, { excludedAllergens: [...prefs.allergies, ...prefs.intolerances], excludedFoods: [...prefs.excludedFoods, ...(prefs.foodContext?.avoid ?? [])], blacklist: rp.filter(p => p.blacklisted || p.frequency === "never").map(p => p.recipeId) }).map(r => ({ r, c: coverage(r.ingredients, stockGrams(stock, today), 1 / r.servings) })).filter(x => x.c.missing.length <= 1 && x.c.ratio > 0).slice(0, 6);
  return <div className="stack">
    <Card className="kitchen-hero" title="Tu cocina, punto de partida" sub="Lo que hay en casa orienta el menú y reduce la compra.">
      <div className="row"><button className="btn primary" onClick={() => setEditor("new")}>Añadir alimento o plato preparado</button>
        <Link className="btn" href={"/asistente?q=" + encodeURIComponent("Quiero actualizar mi nevera virtual con estas fotos. Identifica solo lo visible y usa propose_pantry_items para proponer el inventario. Las cantidades que no se vean quedan desconocidas. Voy a adjuntar las fotos.")}>Añadir con fotos</Link></div>
      <p className="xs dim">La foto se revisa con el asistente y se guarda al aceptar su propuesta. Puedes adjuntar varias fotos y corregir después cada producto.</p>
    </Card>
    <div className="row wrap"><Field label="Buscar en casa"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Tomate, huevos, arroz…" /></Field>
      <Field label="Dónde"><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todo</option>{Object.entries(LOCATIONS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}<option value="soon">Fecha alcanzada</option></select></Field></div>
    {!list.length ? <Empty title="Añade lo que tienes">Puedes indicar cantidades aproximadas o dejarlas como desconocidas. No se descuentan cantidades que no hayas confirmado.</Empty> : <div className="kitchen-grid">{list.map(p => <Card key={p.id} title={p.name} sub={LOCATIONS[p.location ?? "pantry"]}>
      <p>{p.recipeId ? `${p.portions ?? 0} raciones preparadas` : p.quantityKnown === false ? "Cantidad por confirmar" : `${Math.round(p.grams)} g`}{p.opened ? " · Abierto" : ""}</p>
      {p.useBy && <p className={p.useBy < today ? "small stock-expired" : "small"}>{p.useBy < today ? "Fecha superada: revisa antes de usar" : "Usar antes de"} · {p.useBy}</p>}
      <div className="row wrap"><button className="btn sm" onClick={() => setEditor(p)}>Editar</button>
        {p.recipeId && (p.portions ?? 0) > 0 && (!p.useBy || p.useBy >= today) && <PreparedActions item={p} />}
        <ActionButton className="btn sm ghost" onRun={async () => { await remove("pantry_items", p.id); await refreshShoppingList(weekStartOf(today)); }} success="Retirado del inventario">Retirar</ActionButton></div>
    </Card>)}</div>}
    {ready.length > 0 && <Card title="Ideas con lo que tienes" sub="Para una ración; cantidades confirmadas y fecha vigente."><div className="list">{ready.map(({r,c}) => <div className="li" key={r.id}><div className="grow"><b>{r.name}</b><div className="s">{c.missing.length ? `Solo falta: ${c.missing.map(id => cat.food(id)?.name ?? id).join(", ")}` : "Tienes todos los ingredientes"}</div></div><Link className="btn sm" href="/nutricion?tab=recetas">Ver recetas</Link></div>)}</div></Card>}
    {logs.some(l => l.stockUsage?.length) && <Card title="Descuentos recientes" sub="Deshacer devuelve las existencias; conserva el registro de lo comido.">{logs.filter(l => l.stockUsage?.length).sort((a,b) => b.eatenAt.localeCompare(a.eatenAt)).slice(0, 5).map(l => <div className="li" key={l.id}><span className="grow">{l.title} · {l.date}</span><ActionButton className="btn sm" onRun={() => undoStockUsage(l.id)} success="Existencias devueltas">Deshacer descuento</ActionButton></div>)}</Card>}
    <details><summary>Mi compra habitual y disponibilidad</summary><ShoppingContext key={prefs.updatedAt} /></details>
    {editor && <StockEditor key={typeof editor === "string" ? editor : editor.id} item={editor === "new" ? undefined : editor} cat={cat} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); toast("Inventario actualizado"); }} />}
  </div>;
}

function PreparedActions({item}: {item: PantryItem}) {
  const [slot,setSlot] = useState<"lunch" | "dinner">("lunch");
  const [servings,setServings] = useState("1");
  return <div className="row"><Field label="Momento"><select value={slot} onChange={e=>setSlot(e.target.value as typeof slot)}><option value="lunch">Comida</option><option value="dinner">Cena</option></select></Field><Field label="Raciones a comer"><input type="number" min="0.25" max={item.portions ?? 1} step="0.25" value={servings} onChange={e=>setServings(e.target.value)} /></Field><ActionButton className="btn sm" disabled={!servings || Number(servings)<=0 || Number(servings)>(item.portions ?? 0)} onRun={()=>eatLeftover(item.id,slot,Number(servings))} success="Comida registrada desde las raciones preparadas">Registrar estas raciones</ActionButton></div>;
}

function ShoppingContext() {
  const prefs = usePreferences();
  const [locality, setLocality] = useState(prefs.foodContext?.locality ?? "Abegondo");
  const [shops, setShops] = useState(prefs.foodContext?.shops ?? "");
  const [staples, setStaples] = useState(prefs.foodContext?.staples.join(", ") ?? "");
  const [avoid, setAvoid] = useState(prefs.foodContext?.avoid.join(", ") ?? "");
  const split = (s: string) => s.split(",").map(s => s.trim()).filter(Boolean);
  return <Card title="Comprar donde tú compras" sub="La localidad da contexto, no garantiza disponibilidad en tiendas.">
    <div className="grid g2"><Field label="Localidad"><input value={locality} onChange={e => setLocality(e.target.value)} /></Field><Field label="Tiendas o mercados habituales"><input value={shops} onChange={e => setShops(e.target.value)} /></Field>
    <Field label="Productos habituales (separados por comas)"><input value={staples} onChange={e => setStaples(e.target.value)} /></Field><Field label="No proponer / difícil de encontrar"><input value={avoid} onChange={e => setAvoid(e.target.value)} /></Field></div>
    <ActionButton className="btn" onRun={() => patch("preferences", "me", { foodContext: { locality, shops, staples: split(staples), avoid: split(avoid) } })} success="Preferencias guardadas">Guardar preferencias de compra</ActionButton>
  </Card>;
}

function StockEditor({item, cat, onClose, onSaved}: {item?: PantryItem; cat: Catalog; onClose: () => void; onSaved: () => void}) {
  const [foodId,setFoodId] = useState(item?.foodId ?? "");
  const [name,setName] = useState(item?.name ?? "");
  const [grams,setGrams] = useState(String(item?.grams ?? 0));
  const [known,setKnown] = useState(item?.quantityKnown !== false);
  const [location,setLocation] = useState<"fridge" | "freezer" | "pantry">(item?.location ?? "fridge");
  const [opened,setOpened] = useState(!!item?.opened);
  const [useBy,setUseBy] = useState(item?.useBy ?? "");
  const [recipeId,setRecipeId] = useState(item?.recipeId ?? "");
  const [portions,setPortions] = useState(String(item?.portions ?? 1));
  return <Modal open title={item ? "Editar existencias" : "Añadir a mi cocina"} onClose={onClose}>
    <div className="stack"><Field label="Plato ya preparado (opcional)"><select value={recipeId} onChange={e => { setRecipeId(e.target.value); if(e.target.value) setName(cat.recipe(e.target.value)?.name ?? ""); }}><option value="">Es un ingrediente</option>{cat.recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
    {!recipeId && <><Field label="Alimento del catálogo"><input list="kitchen-foods" value={foodId ? cat.food(foodId)?.name ?? name : name} onChange={e => { setName(e.target.value); setFoodId(cat.foods.find(f => f.name === e.target.value)?.id ?? ""); }} /><datalist id="kitchen-foods">{cat.foods.map(f => <option key={f.id} value={f.name} />)}</datalist></Field>
      {!foodId && <Notice>Se puede guardar por nombre. Para calcular nutrientes o intercambiarlo, vincúlalo después a un alimento del catálogo o añade su etiqueta en Alimentos.</Notice>}
      <label><input type="checkbox" checked={known} onChange={e => setKnown(e.target.checked)} /> Conozco la cantidad aproximada</label>{known && <Field label="Gramos disponibles"><input type="number" min="0" max="100000" value={grams} onChange={e => setGrams(e.target.value)} /></Field>}</>}
    {recipeId && <Field label="Raciones ya cocinadas"><input type="number" min="0.25" max="100" step="0.25" value={portions} onChange={e => setPortions(e.target.value)} /></Field>}
    <div className="grid g2"><Field label="Lugar"><select value={location} onChange={e => setLocation(e.target.value as typeof location)}>{Object.entries(LOCATIONS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></Field><Field label="Fecha que quieres vigilar (opcional)"><input type="date" value={useBy} onChange={e => setUseBy(e.target.value)} /></Field></div>
    <label><input type="checkbox" checked={opened} onChange={e => setOpened(e.target.checked)} /> Envase abierto</label>
    <ActionButton className="btn primary" disabled={!name.trim() || (known && (!grams || !Number.isFinite(Number(grams)) || Number(grams) < 0))} onRun={async () => { await saveStock({ id: item?.id, name, foodId: recipeId ? "" : foodId || "unlisted:" + name.trim().toLocaleLowerCase("es"), grams: recipeId || !known ? 0 : Number(grams), quantityKnown: !recipeId && known, location, opened, useBy: useBy || null, recipeId: recipeId || null, portions: recipeId ? Number(portions) : null }); onSaved(); }}>Guardar existencias</ActionButton>
    </div>
  </Modal>;
}
