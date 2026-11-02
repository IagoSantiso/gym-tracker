"use client";
import { useMemo, useState } from "react";
import { ActionButton, Card, Empty, Field, Icon, Kpi, Modal, Notice, NumInput, PageHead, SourceBadge, Tabs, confirmAction, useTabParam, useToast } from "@/components/ui";
import { QuickLog, type QuickKind } from "@/components/log/QuickLog";
import { useLive, usePreferences, useTable } from "@/lib/db/hooks";
import { tbl } from "@/lib/db/db";
import { active, all, patch, put, remove } from "@/lib/db/repo";
import { absorptionHint, cookedFromRaw, fmtNutrient, recipeNutrition, type FoodLike } from "@/lib/domain/nutrition/calc";
import { SECTION_LABEL, SEED_SOURCES, ALLERGENS } from "@/lib/domain/nutrition/foods";
import { SLOT_LABEL, SLOT_ORDER } from "@/lib/domain/nutrition/recipes";
import { eligibleRecipes, swapOptions } from "@/lib/domain/nutrition/menu";
import { quantityLabel, toCsv } from "@/lib/domain/nutrition/shopping";
import { portionLines } from "@/lib/domain/nutrition/portions";
import { addCompensationToPlan, loadDayBalance } from "@/lib/services/balance";
import { addDays, formatDateEs, localDate, weekStartOf } from "@/lib/domain/time";
import type { Food, MealEntry, MealSlot, NutrientTotals, ShopSection } from "@/lib/db/types";
import { generateWeekMenu, loadCatalog, markEaten, refreshShoppingList, saveRecipe, setRecipePref, swapMeal, weekMeals, lookupBarcode, type Catalog } from "@/lib/services/nutrition";
import { currentTargets } from "@/lib/services/targets";
import { download } from "@/lib/services/data";
import { createProposal } from "@/lib/services/plan";

const TABS = ["hoy", "menu", "compra", "recetas", "alimentos", "objetivos"] as const;
type Tab = (typeof TABS)[number];

export function NutritionPage() {
  const [tab, setTab] = useTabParam<Tab>("hoy", TABS);
  const [quick, setQuick] = useState<QuickKind>(null);
  const cat = useLive(() => loadCatalog(), []);
  return (
    <>
      <PageHead eyebrow="Nutrición" title="Comer bien, sin extremos" actions={<button className="btn" onClick={() => setQuick("meal")}><Icon name="plus" />Registrar comida</button>}>
        Menús con cantidades en gramos, hidratos por comida y lista de la compra. Los valores son cálculos sobre datos de referencia: orientativos, no indicaciones de dosis.
      </PageHead>
      <Tabs label="Nutrición" value={tab} onChange={setTab} tabs={[
        { id: "hoy", label: "Hoy" }, { id: "menu", label: "Menú semanal" }, { id: "compra", label: "Lista de la compra" },
        { id: "recetas", label: "Recetas" }, { id: "alimentos", label: "Alimentos" }, { id: "objetivos", label: "Objetivos" },
      ]} />
      {!cat ? <div className="empty-state">Cargando…</div> : (
        <>
          {tab === "hoy" && <TodayTab cat={cat} />}
          {tab === "menu" && <MenuTab cat={cat} />}
          {tab === "compra" && <ShoppingTab cat={cat} />}
          {tab === "recetas" && <RecipesTab cat={cat} />}
          {tab === "alimentos" && <FoodsTab cat={cat} />}
          {tab === "objetivos" && <TargetsTab />}
        </>
      )}
      <QuickLog kind={quick} onClose={() => setQuick(null)} />
    </>
  );
}

export function NutrientLine({ t, compact }: { t: NutrientTotals; compact?: boolean }) {
  return (
    <span className="small">
      <b>{fmtNutrient("carbsAvailableG", t.carbsAvailableG)} g</b> hidratos disp. · {fmtNutrient("kcal", t.kcal)} kcal · {fmtNutrient("proteinG", t.proteinG)} g prot.
      {!compact && <> · {fmtNutrient("fiberG", t.fiberG)} g fibra · {fmtNutrient("fatG", t.fatG)} g grasa · sal {fmtNutrient("saltG", t.saltG)} g</>}
      {t.missing.length > 0 && <span className="xs dim" title={t.missing.join(", ")}> · datos incompletos</span>}
    </span>
  );
}

export function Portions({ recipeIngredients, cat, servings, baseServings, open }: { recipeIngredients: { foodId: string; grams: number; note?: string | null }[]; cat: Catalog; servings: number; baseServings: number; open?: boolean }) {
  const lines = portionLines(recipeIngredients, cat.food, servings, baseServings);
  if (!lines.length) return null;
  return (
    <details open={open} className="portions">
      <summary className="xs" style={{ cursor: "pointer", fontWeight: 650 }}>Cantidades ({lines.length} ingredientes)</summary>
      <ul className="small" style={{ margin: "4px 0 0", paddingLeft: 18 }}>
        {lines.map((l, i) => (
          <li key={`${l.foodId}-${i}`}>
            <b>{l.label}</b> {l.name.toLowerCase()}
            {l.stateNote && <span className="xs dim"> · {l.stateNote}{l.cookedG ? ` (≈ ${l.cookedG} g cocinado)` : ""}</span>}
            {l.note && <span className="xs dim"> · {l.note}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function MealRow({ e, cat, onSwap, openPortions }: { e: MealEntry; cat: Catalog; onSwap: () => void; openPortions?: boolean }) {
  const toast = useToast();
  const r = cat.recipe(e.recipeId);
  if (!r) return null;
  const t = recipeNutrition(r.ingredients, cat.food, e.servings, r.servings).totals;
  const hint = absorptionHint(t);
  return (
    <div className="li wrap" style={{ alignItems: "flex-start", opacity: e.status === "skipped" || e.status === "replaced" ? 0.55 : 1 }}>
      <div className="grow">
        <div className="xs dim" style={{ textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 750 }}>{SLOT_LABEL[e.slot]}{e.locked ? " · 🔒" : ""}</div>
        <div className="t">{r.name}{e.servings !== 1 ? ` · ×${e.servings.toLocaleString("es-ES")}` : ""}</div>
        <NutrientLine t={t} compact />
        <span className="xs dim"> · {fmtNutrient("fatG", t.fatG)} g grasa</span>
        <Portions recipeIngredients={r.ingredients} cat={cat} servings={e.servings} baseServings={r.servings} open={openPortions && e.status === "planned"} />
        {e.status === "replaced" && <div className="xs" style={{ color: "var(--info)" }}>Sustituida por lo que registraste en este hueco</div>}
        {e.notes && <div className="xs muted">{e.notes}</div>}
        {hint && <div className="xs" style={{ color: "var(--info)" }}>{hint}</div>}
        {e.replacedFrom && <div className="xs dim">Sustituye a: {cat.recipe(e.replacedFrom)?.name}</div>}
      </div>
      <div className="acts">
        {e.status === "eaten" ? <span className="badge ok">Hecha</span> : e.status === "replaced" ? (
          <button className="btn sm ghost" onClick={() => void patch("meal_entries", e.id, { status: "planned" })}>Recuperar</button>
        ) : (
          <>
            <ActionButton className="btn sm primary" icon="check" onRun={() => markEaten(e)} success="Comida registrada">Hecha</ActionButton>
            <button className="btn sm" onClick={onSwap}><Icon name="swap" />Cambiar</button>
            <button className="btn sm ghost" onClick={() => void patch("meal_entries", e.id, { status: e.status === "skipped" ? "planned" : "skipped" })}>{e.status === "skipped" ? "Recuperar" : "Saltar"}</button>
          </>
        )}
        <button className="icon-btn" aria-label={e.locked ? "Desbloquear comida" : "Bloquear comida"} onClick={() => void patch("meal_entries", e.id, { locked: !e.locked })}><Icon name={e.locked ? "lock" : "unlock"} /></button>
      </div>
    </div>
  );
}

function SwapModal({ entry, cat, onClose }: { entry: MealEntry | null; cat: Catalog; onClose: () => void }) {
  const prefs = usePreferences();
  const toast = useToast();
  const cur = entry ? cat.recipe(entry.recipeId) : undefined;
  const pool = eligibleRecipes(cat.recipes, cat.food, { excludedAllergens: [...prefs.allergies, ...prefs.intolerances], excludedFoods: prefs.excludedFoods, blacklist: [] });
  const opts = entry && cur ? swapOptions(cur, entry.slot, pool, cat.food, 6) : [];
  return (
    <Modal open={!!entry} onClose={onClose} title={`Cambiar ${cur?.name ?? "comida"}`}>
      <p className="small muted">Ordenadas por energía e hidratos parecidos. La lista de la compra se recalcula sola.</p>
      <div className="list">
        {opts.map((o) => (
          <div className="li" key={o.recipe.id}>
            <div className="grow">
              <div className="t">{o.recipe.name}</div>
              <NutrientLine t={o.totals} compact />
              <div className="xs dim">{o.dKcal >= 0 ? "+" : ""}{Math.round(o.dKcal)} kcal · {o.dCarbs >= 0 ? "+" : ""}{Math.round(o.dCarbs)} g hidratos respecto a la actual</div>
            </div>
            <ActionButton className="btn sm primary" onRun={async () => { await swapMeal(entry!.id, o.recipe.id); onClose(); }} success="Comida cambiada">Elegir</ActionButton>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function DayTotals({ logs, targets }: { logs: NutrientTotals[]; targets?: Awaited<ReturnType<typeof currentTargets>> }) {
  const sum = logs.reduce((a, t) => ({ kcal: a.kcal + t.kcal, p: a.p + t.proteinG, c: a.c + t.carbsAvailableG, f: a.f + t.fiberG }), { kcal: 0, p: 0, c: 0, f: 0 });
  const rng = (r: [number, number] | null | undefined) => (r ? (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`) : "—");
  return (
    <div className="grid g4">
      <Kpi value={Math.round(sum.kcal)} label={`kcal registradas${targets?.kcal ? ` · objetivo ${rng(targets.kcal)}` : ""}`} source="calculated" />
      <Kpi value={`${Math.round(sum.p)} g`} label={`proteína${targets?.proteinG ? ` · rango ${rng(targets.proteinG)} g` : ""}`} source="calculated" />
      <Kpi value={`${Math.round(sum.c)} g`} label={`hidratos disponibles${targets?.carbsG ? ` · plan ${targets.carbsG} g` : ""}`} source="calculated" />
      <Kpi value={`${Math.round(sum.f)} g`} label="fibra · referencia ≥ 25 g" source="calculated" />
    </div>
  );
}

function TodayTab({ cat }: { cat: Catalog }) {
  const today = localDate();
  const ws = weekStartOf(today);
  const meals = useLive(async () => (await weekMeals(ws)).filter((m) => m.date === today), [ws, today]);
  const logs = useLive(async () => (await tbl("food_logs").where("date").equals(today).toArray()).filter(active).sort((a, b) => a.eatenAt.localeCompare(b.eatenAt)), [today]) ?? [];
  const targets = useLive(() => currentTargets(), []);
  const [swap, setSwap] = useState<MealEntry | null>(null);
  const sorted = (meals ?? []).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  return (
    <div className="stack">
      <AdjustDayCard />
      <DayTotals logs={logs.map((l) => l.totals)} targets={targets} />
      <Card title="Comidas previstas hoy">
        {meals && !meals.length ? <Empty title="Sin menú esta semana" action={<button className="btn primary" onClick={() => void generateWeekMenu(ws, { kcalTarget: targets?.kcal ?? null, keepLocked: true })}>Generar menú</button>} /> :
          <div className="list">{sorted.map((e) => <MealRow key={e.id} e={e} cat={cat} onSwap={() => setSwap(e)} openPortions />)}</div>}
      </Card>
      <BalanceCard cat={cat} />
      <Card title="Registrado hoy">
        {logs.length ? (
          <div className="list">
            {logs.map((l) => (
              <div className="li" key={l.id}>
                <div className="grow">
                  <div className="t">{l.title}</div>
                  <div className="s">{new Date(l.eatenAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} · {SLOT_LABEL[l.slot]}</div>
                  <NutrientLine t={l.totals} />
                </div>
                <SourceBadge source={l.source} />
                <button className="icon-btn" aria-label="Borrar registro" onClick={() => confirmAction("¿Borrar este registro?") && void remove("food_logs", l.id)}><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        ) : <Empty title="Nada registrado todavía">Marca una comida prevista como hecha o usa «Registrar comida».</Empty>}
      </Card>
      <SwapModal entry={swap} cat={cat} onClose={() => setSwap(null)} />
    </div>
  );
}

const ADJUST_EXAMPLES = [
  "He desayunado tortilla francesa de 2 huevos y dos tostadas con café con leche. Para comer tengo arroz y puedo añadir otra cosa: ajusta lo que queda del día.",
  "Me han ofrecido dos rosquillas en el trabajo: ¿cuánto suponen y cómo encajo la cena?",
  "No tengo los ingredientes de la cena; tengo pollo, patata y calabacín.",
];

/** Lenguaje natural → asistente: registrar lo comido y reajustar lo que queda (siempre como propuestas). */
export function AdjustDayCard() {
  const [text, setText] = useState("");
  const go = (q: string) => { location.assign(`/asistente?send=1&q=${encodeURIComponent(q)}`); };
  return (
    <Card title="Ajusta mi día" sub="Cuéntale al asistente qué has comido o qué tienes en casa. Registra lo comido y te propone cómo encajar el resto del día; tú apruebas cada cambio.">
      <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: He desayunado tortilla francesa y dos tostadas con café con leche; para comer tengo arroz…" aria-label="Qué has comido o qué tienes" />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" disabled={!text.trim()} onClick={() => go(text.trim())}><Icon name="chat" />Ajustar con el asistente</button>
      </div>
      <div className="pill-row" style={{ marginTop: 8 }}>
        {ADJUST_EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => setText(e)}>{e.length > 48 ? `${e.slice(0, 46)}…` : e}</button>)}
      </div>
      <p className="xs dim" style={{ marginBottom: 0 }}>Sin compensar con ejercicio ni saltarse comidas. Nunca da indicaciones de insulina.</p>
    </Card>
  );
}

const VERDICT = { on_track: "Día en objetivo", over: "Por encima", under: "Te quedas corto", unknown: "" } as const;

const STATUS_LABEL = { low: "por debajo", ok: "en rango", high: "por encima", unknown: "sin objetivo" } as const;

/** Balance del día: lo comido + lo que queda, frente a tus rangos; y opciones para reajustar lo que queda. */
export function BalanceCard({ cat, compact }: { cat: Catalog; compact?: boolean }) {
  const toast = useToast();
  const b = useLive(() => loadDayBalance(localDate(), cat), [cat]);
  const prefs = usePreferences();
  const prefsPct = prefs.compensationMaxPct ?? 30;
  if (!b) return null;
  const fmtR = (r: [number, number] | null) => (!r ? "—" : !Number.isFinite(r[1]) ? `≥ ${r[0]}` : r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);
  const apply = async (o: (typeof b.options)[number]) => {
    if (o.carbsChanged && !confirmAction(`Este cambio modifica los hidratos de esa comida en ${o.dCarbs > 0 ? "+" : ""}${Math.round(o.dCarbs)} g. Si sigues una pauta de hidratos o de insulina, revísalo con tu protocolo y tu equipo sanitario. ¿Aplicar?`)) return;
    if (o.recipe.id === b.remaining.find((m) => m.id === o.mealId)?.recipe.id) await patch("meal_entries", o.mealId, { servings: o.servings });
    else await swapMeal(o.mealId, o.recipe.id);
    toast("Resto del día reajustado");
  };
  return (
    <Card title="Balance del día" sub="Lo comido + lo que queda del menú, frente a tus rangos. Orientativo." right={b.energy.ok ? <span className={`badge ${b.energy.verdict === "on_track" ? "ok" : "warn"}`}>{VERDICT[b.energy.verdict]}</span> : undefined}>
      {b.energy.ok && (
        <div className="energy-box">
          <div className="energy-grid">
            <div><small>Consumido</small><b>{b.energy.intake.toLocaleString("es-ES")}</b>{b.energy.projectedIntake > b.energy.intake && <span className="xs dim">+{(b.energy.projectedIntake - b.energy.intake).toLocaleString("es-ES")} previsto</span>}</div>
            <div><small>Gastado (estimado)</small><b>{b.energy.spent.toLocaleString("es-ES")}</b><span className="xs dim">basal+día {b.energy.base + b.energy.steps}{b.energy.exercise ? ` · ejercicio ${b.energy.exercise}` : ""}</span></div>
            <div><small>Balance previsto</small><b>{b.energy.projectedBalance > 0 ? "+" : ""}{b.energy.projectedBalance.toLocaleString("es-ES")}</b><span className="xs dim">objetivo {b.energy.targetBalance ? `${b.energy.targetBalance.toLocaleString("es-ES")}` : "≈ 0"}</span></div>
          </div>
          <div className="small" style={{ marginTop: 6 }}>{b.energy.message}</div>
          {b.exerciseToday.length > 0 && <div className="xs dim">Ejercicio de hoy: {b.exerciseToday.map((e) => `${e.label} (~${e.kcal} kcal)`).join(" · ")}</div>}
        </div>
      )}
      {b.compensation && (
        <div className="comp-box">
          <div className="small"><b>Opción: compensar ~{b.compensation.kcal} kcal con actividad suave</b> ({b.compensation.pct} % del exceso; tu máximo: {prefsPct} %). El resto (~{b.compensation.restForMeals} kcal), ajustando lo que queda por comer.</div>
          <div className="list">
            {b.compensation.activities.map((a) => (
              <div className="li" key={a.label}>
                <div className="grow"><div className="t">{a.label}: {a.minutes} min</div><div className="s">Cinta {a.speedKmh.toLocaleString("es-ES")} km/h · inclinación {a.inclinePct} %</div></div>
                <ActionButton className="btn sm" icon="plus" onRun={() => addCompensationToPlan(b.date, a, b.compensation!.kcal)} success="Añadida al plan de hoy">Al plan</ActionButton>
              </div>
            ))}
          </div>
          <ul className="xs dim" style={{ margin: "4px 0 0", paddingLeft: 16 }}>{b.compensation.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
      {!b.logs.length && !b.remaining.length ? (
        <p className="small muted" style={{ margin: 0 }}>Cuando tengas menú o registres lo que comes (aunque no sea lo del menú), aquí verás cómo va el día frente a tus rangos.</p>
      ) : (<>
      {!b.logs.length && <p className="small muted" style={{ marginTop: 0 }}>Aún no has registrado nada hoy: abajo ves lo previsto por el menú.</p>}
      {!b.targets.kcal && <Notice kind="info">Sin objetivos calculables todavía: completa peso, altura y edad en Ajustes o fija tus objetivos para ver los rangos.</Notice>}
      <div className="list">
        {b.nutrients.filter((n) => (!compact || n.key !== "fiberG") && !(b.energy.ok && n.key === "kcal") && (n.target || n.consumed > 0 || n.planned > 0)).map((n) => {
          const max = Math.max(n.projected, n.target && Number.isFinite(n.target[1]) ? n.target[1] : n.target?.[0] ?? 0, 1);
          return (
            <div key={n.key} className="balance-row">
              <div className="row between small" style={{ flexWrap: "nowrap", alignItems: "baseline" }}>
                <b>{n.label}</b>
                <span style={{ textAlign: "right" }}><b>{Math.round(n.projected)}</b> {n.unit}{n.target && <span className="muted"> / {fmtR(n.target)}</span>} {n.status !== "unknown" && <span className={`badge ${n.status === "ok" ? "ok" : "warn"}`}>{STATUS_LABEL[n.status]}</span>}</span>
              </div>
              <div className="xs dim">{Math.round(n.consumed)} comido + {Math.round(n.planned)} previsto</div>
              <div className="bar" aria-hidden><span style={{ width: `${Math.min(100, (n.consumed / max) * 100)}%` }} /><span className="planned" style={{ width: `${Math.min(100, (n.planned / max) * 100)}%` }} /></div>
            </div>
          );
        })}
      </div>
      </>)}
      {b.messages.map((m, i) => <Notice key={i} kind="info">{m}</Notice>)}
      {b.hasEstimates && <p className="xs dim">Incluye comidas estimadas (sin etiqueta): los valores pueden desviarse bastante.</p>}
      {b.options.length > 0 && compact && <a className="btn sm" href="/nutricion?tab=hoy">Ver {b.options.length} opciones para reajustar lo que queda</a>}
      {b.options.length > 0 && !compact && (
        <>
          <div className="small" style={{ fontWeight: 700, margin: "10px 0 4px" }}>Opciones para lo que queda</div>
          <div className="list">
            {b.options.map((o) => (
              <div className="li" key={`${o.mealId}-${o.recipe.id}-${o.servings}`}>
                <div className="grow">
                  <div className="t">{SLOT_LABEL[o.slot]}: {o.recipe.id === b.remaining.find((m) => m.id === o.mealId)?.recipe.id ? `misma receta ×${o.servings.toLocaleString("es-ES")}` : o.recipe.name}</div>
                  <div className="xs dim">{o.why} · {o.carbsChanged ? <b style={{ color: "var(--amber)" }}>cambia los hidratos {o.dCarbs > 0 ? "+" : ""}{Math.round(o.dCarbs)} g</b> : "mantiene los hidratos"}</div>
                </div>
                <button className="btn sm" onClick={() => void apply(o)}>Aplicar</button>
              </div>
            ))}
          </div>
        </>
      )}
      {b.logs.length > 0 && <p className="xs dim" style={{ marginBottom: 0 }}>Nunca se proponen saltarse comidas ni ejercicio intenso para compensar; la actividad suave está limitada a tu % máximo y 30 min. Prioriza mantener los hidratos de cada comida.</p>}
    </Card>
  );
}

function MenuTab({ cat }: { cat: Catalog }) {
  const [ws, setWs] = useState(weekStartOf(localDate()));
  const meals = useLive(() => weekMeals(ws), [ws]) ?? [];
  const targets = useLive(() => currentTargets(), []);
  const [useTarget, setUseTarget] = useState(true);
  const [swap, setSwap] = useState<MealEntry | null>(null);
  const toast = useToast();
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const batch = useMemo(() => {
    const count = new Map<string, number>();
    meals.forEach((m) => { if (cat.recipe(m.recipeId)?.batchFriendly && (m.slot === "lunch" || m.slot === "dinner")) count.set(m.recipeId, (count.get(m.recipeId) ?? 0) + 1); });
    return [...count.entries()].filter(([, n]) => n >= 2);
  }, [meals, cat]);
  return (
    <div className="stack">
      <div className="row between">
        <div className="row">
          <button className="icon-btn" aria-label="Semana anterior" onClick={() => setWs(addDays(ws, -7))}><Icon name="left" /></button>
          <b>Semana del {formatDateEs(ws, { day: "numeric", month: "long" })}</b>
          <button className="icon-btn" aria-label="Semana siguiente" onClick={() => setWs(addDays(ws, 7))}><Icon name="right" /></button>
        </div>
        <div className="row no-print">
          <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={useTarget} onChange={(e) => setUseTarget(e.target.checked)} />Ajustar raciones a mi objetivo {targets?.kcal ? `(${targets.kcal[0]}–${targets.kcal[1]} kcal)` : "(sin objetivo calculable)"}</label>
          <ActionButton className="btn primary" icon="sync" busyLabel="Generando…" onRun={() => generateWeekMenu(ws, { kcalTarget: useTarget ? targets?.kcal ?? null : null, keepLocked: true })} success="Menú generado (se conservan las comidas bloqueadas y hechas)">{meals.length ? "Regenerar" : "Generar menú"}</ActionButton>
          <button className="btn ghost" onClick={() => window.print()}><Icon name="printer" />Imprimir</button>
        </div>
      </div>
      {!meals.length ? <Empty title="Sin menú para esta semana">Genera uno: respeta alergias, exclusiones, tiempo de cocina y tus días de entrenamiento.</Empty> : days.map((d) => {
        const dm = meals.filter((m) => m.date === d).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
        const tot = dm.filter((m) => m.status !== "skipped").reduce((acc, m) => {
          const r = cat.recipe(m.recipeId);
          if (!r) return acc;
          const t = recipeNutrition(r.ingredients, cat.food, m.servings, r.servings).totals;
          return { kcal: acc.kcal + t.kcal, c: acc.c + t.carbsAvailableG, p: acc.p + t.proteinG, f: acc.f + t.fiberG };
        }, { kcal: 0, c: 0, p: 0, f: 0 });
        return (
          <Card key={d} title={formatDateEs(d, { weekday: "long", day: "numeric", month: "short" })} sub={`${Math.round(tot.kcal)} kcal · ${Math.round(tot.p)} g proteína · ${Math.round(tot.c)} g hidratos disp. · ${Math.round(tot.f)} g fibra`}>
            <div className="list">{dm.map((e) => <MealRow key={e.id} e={e} cat={cat} onSwap={() => setSwap(e)} />)}</div>
          </Card>
        );
      })}
      {batch.length > 0 && (
        <Card title="Preparación por lotes">
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {batch.map(([id, n]) => <li key={id}>Cocina <b>{cat.recipe(id)?.name}</b> para {n} comidas de una vez (guárdalo en la nevera hasta 3 días o congela).</li>)}
          </ul>
        </Card>
      )}
      <SwapModal entry={swap} cat={cat} onClose={() => setSwap(null)} />
    </div>
  );
}

function ShoppingTab({ cat }: { cat: Catalog }) {
  const ws = weekStartOf(localDate());
  const list = useLive(async () => (await tbl("shopping_lists").where("weekStart").equals(ws).toArray()).find(active), [ws]);
  const pantry = useTable("pantry_items") ?? [];
  const [extra, setExtra] = useState("");
  const toast = useToast();
  if (!list) return <Empty title="Sin lista esta semana" action={<button className="btn primary" onClick={() => void refreshShoppingList(ws)}>Crear desde el menú</button>}>Se genera a partir del menú semanal.</Empty>;
  const sections = [...new Set(list.items.map((i) => i.section))] as ShopSection[];
  const toggle = (key: string) => void patch("shopping_lists", list.id, { items: list.items.map((i) => (i.key === key ? { ...i, checked: !i.checked } : i)) });
  const toPantry = async (foodId: string, name: string, grams: number) => {
    const ex = pantry.find((p) => p.foodId === foodId);
    if (ex) await patch("pantry_items", ex.id, { grams: ex.grams + grams });
    else await put("pantry_items", { foodId, name, grams });
    await refreshShoppingList(ws);
    toast(`${name} en despensa`);
  };
  return (
    <div className="stack">
      <div className="row no-print">
        <button className="btn" onClick={() => void refreshShoppingList(ws)}><Icon name="sync" />Recalcular</button>
        <button className="btn ghost" onClick={() => download(new Blob(["﻿" + toCsv(list.items, (s) => SECTION_LABEL[s])], { type: "text/csv" }), `compra-${ws}.csv`)}><Icon name="download" />CSV</button>
        <button className="btn ghost" onClick={() => window.print()}><Icon name="printer" />Imprimir</button>
      </div>
      {sections.map((s) => (
        <Card key={s} title={SECTION_LABEL[s]}>
          <div className="list">
            {list.items.filter((i) => i.section === s).map((i) => {
              const buy = Math.max(0, i.grams - i.pantryGrams);
              return (
                <div className="li" key={i.key}>
                  <input type="checkbox" checked={i.checked} onChange={() => toggle(i.key)} aria-label={`Comprado: ${i.name}`} style={{ width: 22, height: 22 }} />
                  <div className="grow" style={{ textDecoration: i.checked ? "line-through" : undefined, opacity: buy === 0 ? 0.5 : 1 }}>
                    <div className="t">{i.name}</div>
                    <div className="s">{buy ? quantityLabel(buy, cat.food(i.foodId)) : "Lo tienes en casa"}{i.pantryGrams ? ` · ${Math.round(i.pantryGrams)} g en despensa` : ""}</div>
                  </div>
                  {buy > 0 && <button className="btn sm ghost no-print" onClick={() => void toPantry(i.foodId, i.name, buy)}>Ya lo tengo</button>}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      <Card title="Otros">
        {list.extra.map((x, k) => (
          <label className="li" key={k}><input type="checkbox" checked={x.checked} onChange={() => void patch("shopping_lists", list.id, { extra: list.extra.map((y, j) => (j === k ? { ...y, checked: !y.checked } : y)) })} /> {x.name}</label>
        ))}
        <div className="row no-print"><input className="input" style={{ maxWidth: 260 }} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Añadir producto" aria-label="Añadir producto" />
          <button className="btn sm" disabled={!extra.trim()} onClick={async () => { await patch("shopping_lists", list.id, { extra: [...list.extra, { name: extra.trim(), checked: false }] }); setExtra(""); }}>Añadir</button></div>
      </Card>
      {pantry.length > 0 && (
        <Card title="Despensa">
          <div className="pill-row">{pantry.map((p) => <button key={p.id} className="chip" onClick={async () => { await remove("pantry_items", p.id); await refreshShoppingList(ws); }} title="Quitar de la despensa">{p.name} · {Math.round(p.grams)} g ✕</button>)}</div>
        </Card>
      )}
    </div>
  );
}

function RecipesTab({ cat }: { cat: Catalog }) {
  const prefsR = useTable("recipe_prefs") ?? [];
  const [q, setQ] = useState("");
  const [slot, setSlot] = useState<MealSlot | "">("");
  const [open, setOpen] = useState<string | null>(null);
  const [servings, setServings] = useState<number | null>(1);
  const [editor, setEditor] = useState(false);
  const pr = (id: string) => prefsR.find((p) => p.recipeId === id);
  const list = cat.recipes.filter((r) => (!q || r.name.toLowerCase().includes(q.toLowerCase())) && (!slot || r.slots.includes(slot)));
  const r = open ? cat.recipe(open) : undefined;
  const nut = r ? recipeNutrition(r.ingredients, cat.food, servings ?? 1, r.servings) : null;
  return (
    <div className="stack">
      <div className="grid g3">
        <Field label="Buscar"><input value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field label="Momento"><select value={slot} onChange={(e) => setSlot(e.target.value as MealSlot | "")}><option value="">Todos</option>{(Object.keys(SLOT_LABEL) as MealSlot[]).map((s) => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}</select></Field>
        <div style={{ alignSelf: "end" }}><button className="btn" onClick={() => setEditor(true)}><Icon name="plus" />Nueva receta</button></div>
      </div>
      <div className="list card">
        {list.map((x) => {
          const t = recipeNutrition(x.ingredients, cat.food, 1, x.servings).totals;
          const p = pr(x.id);
          return (
            <div className="li" key={x.id}>
              <button className="grow" style={{ textAlign: "left" }} onClick={() => { setOpen(x.id); setServings(1); }}>
                <div className="t">{x.name} {p?.favorite && "★"}{p?.blacklisted && " ⊘"}</div>
                <div className="s">{x.slots.map((s) => SLOT_LABEL[s]).join(", ")} · {x.prepMin + x.cookMin} min · {Math.round(t.kcal)} kcal · {Math.round(t.carbsAvailableG)} g hidratos</div>
              </button>
              <button className="icon-btn" aria-label="Favorita" aria-pressed={!!p?.favorite} onClick={() => void setRecipePref(x.id, { favorite: !p?.favorite, blacklisted: false })}><Icon name="star" /></button>
              <button className="icon-btn" aria-label="No proponer" aria-pressed={!!p?.blacklisted} onClick={() => void setRecipePref(x.id, { blacklisted: !p?.blacklisted, favorite: false })}><Icon name="x" /></button>
            </div>
          );
        })}
      </div>
      <Modal open={!!r} onClose={() => setOpen(null)} title={r?.name ?? ""}>
        {r && nut && (
          <div className="stack">
            <div className="row"><Field label="Raciones"><NumInput value={servings} onChange={setServings} ariaLabel="Raciones" /></Field><SourceBadge source={r.source === "seed" ? "seed" : "manual"} /></div>
            <table className="data">
              <thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Hidratos disp.</th><th>kcal</th></tr></thead>
              <tbody>
                {nut.lines.map((l, i) => (
                  <tr key={i}><td>{l.food?.name ?? l.foodId}{l.note ? <div className="xs dim">{l.note}</div> : null}</td>
                    <td>{Math.round(l.grams)} g{l.food?.state === "raw" && l.food.yieldFactor && l.food.yieldFactor !== 1 ? <div className="xs dim">≈ {Math.round(cookedFromRaw(l.grams, l.food.yieldFactor))} g cocinado</div> : l.food?.state === "cooked" ? <div className="xs dim">peso cocinado</div> : null}</td>
                    <td>{fmtNutrient("carbsAvailableG", l.totals.carbsAvailableG)} g</td><td>{fmtNutrient("kcal", l.totals.kcal)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="notice info"><div><NutrientLine t={nut.totals} /><div className="xs dim">Total para {servings} ración(es). Cálculo determinista con valores de referencia.</div></div></div>
            {absorptionHint(nut.totals) && <p className="xs" style={{ color: "var(--info)" }}>{absorptionHint(nut.totals)}</p>}
            <ol className="small">{r.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            <p className="xs dim">{r.prepMin} min preparación · {r.cookMin} min cocción · dificultad {"●".repeat(r.difficulty)}{r.batchFriendly ? " · apta para lotes" : ""}</p>
          </div>
        )}
      </Modal>
      {editor && <RecipeEditor cat={cat} onClose={() => setEditor(false)} />}
    </div>
  );
}

function RecipeEditor({ cat, onClose }: { cat: Catalog; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [slots, setSlots] = useState<MealSlot[]>(["lunch"]);
  const [servings, setServings] = useState<number | null>(1);
  const [ings, setIngs] = useState<{ foodId: string; grams: number | null }[]>([{ foodId: "", grams: null }]);
  const [steps, setSteps] = useState("");
  const [time, setTime] = useState<number | null>(20);
  const valid = name.trim() && ings.some((i) => i.foodId && i.grams);
  const preview = valid ? recipeNutrition(ings.filter((i) => i.foodId && i.grams).map((i) => ({ foodId: i.foodId, grams: i.grams!, note: null })), cat.food, 1, servings ?? 1).totals : null;
  return (
    <Modal open title="Nueva receta" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!valid} onClick={async () => {
      await saveRecipe({ name: name.trim(), slots, servings: servings ?? 1, prepMin: time ?? 10, cookMin: 0, difficulty: 1, steps: steps.split("\n").map((s) => s.trim()).filter(Boolean), tags: [], batchFriendly: (servings ?? 1) > 1, costLevel: 2, source: "manual" },
        ings.filter((i) => i.foodId && i.grams).map((i) => ({ foodId: i.foodId, grams: i.grams!, note: null })));
      toast("Receta guardada");
      onClose();
    }}>Guardar</button></>}>
      <div className="stack">
        <Field label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="pill-row">{(Object.keys(SLOT_LABEL) as MealSlot[]).map((s) => <button key={s} className="chip" aria-pressed={slots.includes(s)} onClick={() => setSlots((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))}>{SLOT_LABEL[s]}</button>)}</div>
        <div className="grid g2"><Field label="Raciones que salen"><NumInput value={servings} onChange={setServings} ariaLabel="Raciones" /></Field><Field label="Tiempo total (min)"><NumInput value={time} onChange={setTime} ariaLabel="Tiempo" /></Field></div>
        {ings.map((it, i) => (
          <div className="grid g2" key={i}>
            <Field label={`Ingrediente ${i + 1}`}><select value={it.foodId} onChange={(e) => setIngs((x) => x.map((y, j) => (j === i ? { ...y, foodId: e.target.value } : y)))}><option value="">Elige…</option>{cat.foods.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.state === "raw" ? "crudo" : f.state === "cooked" ? "cocinado" : "tal cual"})</option>)}</select></Field>
            <Field label="Gramos"><NumInput value={it.grams} onChange={(v) => setIngs((x) => x.map((y, j) => (j === i ? { ...y, grams: v } : y)))} ariaLabel="Gramos" /></Field>
          </div>
        ))}
        <button className="btn sm ghost" onClick={() => setIngs((x) => [...x, { foodId: "", grams: null }])}>+ Ingrediente</button>
        <Field label="Pasos (uno por línea)"><textarea value={steps} onChange={(e) => setSteps(e.target.value)} /></Field>
        {preview && <div className="notice info"><div>Por ración: <NutrientLine t={preview} /></div></div>}
      </div>
    </Modal>
  );
}

function FoodsTab({ cat }: { cat: Catalog }) {
  const custom = useTable("foods") ?? [];
  const [q, setQ] = useState("");
  const [code, setCode] = useState("");
  const [draft, setDraft] = useState<Omit<Food, "id" | "createdAt" | "updatedAt"> | null>(null);
  const toast = useToast();
  const list = cat.foods.filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()));
  const src = (id: string) => SEED_SOURCES.find((s) => s.id === id);
  const blank = (): Omit<Food, "id" | "createdAt" | "updatedAt"> => ({
    name: "", brand: null, barcode: null, state: "as_sold", per100: { kcal: null, proteinG: null, carbsAvailableG: null, carbsTotalG: null, fiberG: null, fatG: null, satFatG: null, sugarsG: null, saltG: null },
    carbBasis: "available", sourceId: "label", sourceRef: null, sourceVersion: null, retrievedAt: new Date().toISOString(), section: "otros", yieldFactor: null, rawFoodId: null, unitWeights: null, tags: [], allergens: [], notes: null, source: "manual",
  });
  return (
    <div className="stack">
      <div className="grid g3">
        <Field label="Buscar"><input value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field label="Código de barras (Open Food Facts)"><div className="row" style={{ flexWrap: "nowrap" }}><input className="input" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /><button className="btn sm" onClick={async () => { const r = await lookupBarcode(code); if ("error" in r) toast(r.error); else setDraft(r); }}>Buscar</button></div></Field>
        <div style={{ alignSelf: "end" }}><button className="btn" onClick={() => setDraft(blank())}><Icon name="plus" />Alimento desde etiqueta</button></div>
      </div>
      <Card>
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Alimento</th><th>kcal</th><th>Prot.</th><th>Hidr. disp.</th><th>Fibra</th><th>Grasa</th><th>Fuente</th></tr></thead>
            <tbody>
              {list.map((f) => {
                const s = src((f as Food).sourceId ?? "usda_sr");
                return (
                  <tr key={f.id}>
                    <td>{f.name}<div className="xs dim">{f.state === "raw" ? "crudo" : f.state === "cooked" ? "cocinado" : "tal cual"}{f.yieldFactor && f.state === "raw" ? ` · ×${f.yieldFactor} al cocinar` : ""}</div></td>
                    <td>{f.per100.kcal ?? "—"}</td><td>{f.per100.proteinG ?? "—"}</td><td>{f.per100.carbsAvailableG ?? "—"}{f.carbBasis === "total" && <span className="xs dim" title="Fuente con hidratos totales; disponibles = totales − fibra"> *</span>}</td><td>{f.per100.fiberG ?? "—"}</td><td>{f.per100.fatG ?? "—"}</td>
                    <td className="xs">{s?.name ?? (f as Food).sourceId}{(f as Food).sourceRef ? ` · ${(f as Food).sourceRef}` : ""}
                      {custom.some((c) => c.id === f.id) && <button className="btn sm ghost" onClick={() => confirmAction("¿Borrar alimento?") && void remove("foods", f.id)}>Borrar</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="xs dim">Valores por 100 g. * Fuente USDA: los hidratos se publican totales (con fibra); se muestran los disponibles (totales − fibra). Fuentes: {SEED_SOURCES.map((s) => `${s.name} (${s.license})`).join(" · ")}.</p>
      </Card>
      {draft && (
        <Modal open title={draft.sourceId === "off" ? "Producto de Open Food Facts" : "Nuevo alimento"} onClose={() => setDraft(null)} footer={<><button className="btn ghost" onClick={() => setDraft(null)}>Cancelar</button><button className="btn primary" disabled={!draft.name.trim()} onClick={async () => { await put("foods", draft); toast("Alimento guardado"); setDraft(null); }}>Guardar</button></>}>
          <div className="stack">
            {draft.sourceId === "off" && <Notice kind="info">Datos © Open Food Facts (ODbL). Revisa que coinciden con tu etiqueta; puedes corregirlos.</Notice>}
            <div className="grid g2">
              <Field label="Nombre"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
              <Field label="Marca"><input value={draft.brand ?? ""} onChange={(e) => setDraft({ ...draft, brand: e.target.value || null })} /></Field>
              <Field label="Estado"><select value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value as Food["state"] })}><option value="as_sold">Tal cual se vende</option><option value="raw">Crudo</option><option value="cooked">Cocinado</option></select></Field>
              <Field label="Sección"><select value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value as ShopSection })}>{(Object.keys(SECTION_LABEL) as ShopSection[]).map((s) => <option key={s} value={s}>{SECTION_LABEL[s]}</option>)}</select></Field>
            </div>
            <b className="small">Por 100 g (deja vacío lo que no indique la etiqueta: no se inventa)</b>
            <div className="grid g3">
              {([["kcal", "Energía (kcal)"], ["proteinG", "Proteínas"], ["carbsAvailableG", "Hidratos (etiqueta UE = disponibles)"], ["sugarsG", "de los cuales azúcares"], ["fiberG", "Fibra"], ["fatG", "Grasas"], ["satFatG", "Saturadas"], ["saltG", "Sal"]] as const).map(([k, l]) => (
                <Field key={k} label={l}><NumInput value={draft.per100[k]} ariaLabel={l} onChange={(v) => setDraft({ ...draft, per100: { ...draft.per100, [k]: v } })} /></Field>
              ))}
            </div>
            <div className="pill-row">{ALLERGENS.map((a) => <button key={a.id} className="chip" aria-pressed={draft.allergens.includes(a.id)} onClick={() => setDraft({ ...draft, allergens: draft.allergens.includes(a.id) ? draft.allergens.filter((x) => x !== a.id) : [...draft.allergens, a.id] })}>{a.label}</button>)}</div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TargetsTab() {
  const t = useLive(() => currentTargets(), []);
  const toast = useToast();
  if (!t) return null;
  const e = t.estimate;
  const fast = t.ratePerWeek != null && t.latestWeight && t.ratePerWeek < -(t.latestWeight * 0.01);
  return (
    <div className="stack">
      <Card title={t.mode === "manual" ? "Objetivo acordado" : "Objetivo estimado"} sub={t.source} right={<SourceBadge source={t.mode === "manual" ? "manual" : "estimated"} />}>
        {t.mode === "estimated" && e && !e.ok ? (
          <Notice kind="info">Faltan datos para estimar: {e.missing.join(", ")}. Complétalos en Ajustes → Perfil o registra tu peso. Mientras, el menú no ajusta raciones.</Notice>
        ) : (
          <div className="grid g4">
            <Kpi value={t.kcal ? (t.kcal[0] === t.kcal[1] ? t.kcal[0] : `${t.kcal[0]}–${t.kcal[1]}`) : "—"} label="kcal/día" source={t.mode === "manual" ? "manual" : "estimated"} />
            <Kpi value={t.proteinG ? `${t.proteinG[0]}–${t.proteinG[1]} g` : "—"} label="proteína/día (1,6–2,2 g/kg)" source="estimated" />
            <Kpi value={`≥ ${t.fiberG} g`} label="fibra/día (EFSA)" source="calculated" />
            <Kpi value={t.carbsG ? `${t.carbsG} g` : "Tu plan"} label="hidratos: según tu equipo" />
          </div>
        )}
        {e?.ok && (
          <details className="small" style={{ marginTop: 10 }}>
            <summary className="muted">Fórmula, supuestos y margen</summary>
            <p>Fórmula: {e.formula}. Metabolismo basal estimado {e.bmr![0]}–{e.bmr![1]} kcal; gasto total {e.tdee![0]}–{e.tdee![1]} kcal; déficit aplicado ~{e.deficitKcal} kcal/día.</p>
            <ul>{e.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            <ul>{e.warnings.map((a) => <li key={a}>{a}</li>)}</ul>
          </details>
        )}
      </Card>
      <Card title="Tendencia de peso" sub="Media móvil exponencial; se compara con el objetivo tras 3–4 semanas de datos.">
        {t.ratePerWeek == null ? <p className="small muted">Aún no hay suficientes registros (mínimo ~2 semanas con 6 pesajes). Ve a Progreso → Peso.</p> : (
          <>
            <p className="small">Ritmo actual: <b>{t.ratePerWeek.toLocaleString("es-ES")} kg/semana</b>{t.latestWeight ? ` (${((t.ratePerWeek / t.latestWeight) * 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} %)` : ""} con {t.trendDays} días de datos.</p>
            {fast && t.trendDays >= 21 && (
              <>
                <Notice kind="warn">Estás perdiendo peso más rápido del 1 %/semana. Puede ser agua al principio, pero sostenido no es lo prudente.</Notice>
                <button className="btn sm" style={{ marginTop: 8 }} onClick={async () => {
                  const g = await tbl("goals").get("me");
                  if (!g) return;
                  const r = await createProposal({
                    domain: "goals", kind: "slow_rate", title: "Reducir el ritmo de pérdida", summary: `Bajar el ritmo objetivo de ${g.weightLossRatePct} % a ${Math.max(0.25, g.weightLossRatePct - 0.25)} % semanal (menos déficit).`,
                    reasons: [`Tendencia de ${t.ratePerWeek} kg/semana durante ${t.trendDays} días.`], dataUsed: ["Registros de peso (tendencia suavizada)"], assumptions: ["Los registros son representativos (condiciones similares)."],
                    warnings: [], confidence: "medium", ops: [{ op: "update", table: "goals", id: "me", changes: { weightLossRatePct: Math.max(0.25, g.weightLossRatePct - 0.25) } }],
                    inverse: [{ op: "update", table: "goals", id: "me", changes: { weightLossRatePct: g.weightLossRatePct } }], origin: "rules", requiresApproval: true, expiresAt: null,
                  });
                  toast("error" in r ? r.error : "Propuesta creada en Plan → Propuestas");
                }}>Proponer reducir el ritmo</button>
              </>
            )}
            {t.ratePerWeek > -0.05 && t.trendDays >= 28 && <p className="small muted">La tendencia está estable. Antes de cambiar nada, revisa la constancia de los registros y coméntalo con tu dietista si lo tienes. La app no recorta calorías por días sedentarios.</p>}
          </>
        )}
      </Card>
    </div>
  );
}
