"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ActionButton, Card, Empty, Icon, Kpi, Notice, SourceBadge, useToast } from "@/components/ui";
import { QuickLog, type QuickKind } from "@/components/log/QuickLog";
import { AdjustDayCard, BalanceCard, Portions } from "@/components/pages/NutritionPage";
import { loadDayBalance, type DayBalanceView } from "@/lib/services/balance";
import { ProposalCard } from "@/components/plan/ProposalCard";
import { useDiabetes, useLive, useProfile } from "@/lib/db/hooks";
import { tbl } from "@/lib/db/db";
import { active, all, patch } from "@/lib/db/repo";
import { addDays, formatDateEs, localDate, weekStartOf } from "@/lib/domain/time";
import { computeMetrics } from "@/lib/domain/cgm/metrics";
import { formatGlucose } from "@/lib/domain/units";
import { recipeNutrition } from "@/lib/domain/nutrition/calc";
import { SLOT_LABEL, SLOT_ORDER } from "@/lib/domain/nutrition/recipes";
import { SPORT_LABEL } from "@/lib/domain/training/endurance";
import { proposeEaseToday, proposeReschedule } from "@/lib/domain/planning/adapt";
import { createProposal, ensurePlan, weekItems } from "@/lib/services/plan";
import { loadCatalog, markEaten, weekMeals } from "@/lib/services/nutrition";
import { readingsBetween } from "@/lib/services/cgm";
import { currentTargets } from "@/lib/services/targets";
import type { PlannedItem } from "@/lib/db/types";

const STATUS: Record<PlannedItem["status"], string> = { planned: "Previsto", done: "Hecho", modified: "Modificado", cancelled: "Cancelado", moved: "Movido" };

export function TodayPage() {
  const p = useProfile();
  const dia = useDiabetes();
  const toast = useToast();
  const today = localDate(Date.now(), p.timezone);
  const ws = weekStartOf(today);
  const [quick, setQuick] = useState<QuickKind>(null);

  useEffect(() => {
    void (async () => {
      await ensurePlan(today);
      // Reglas automáticas: sesiones perdidas de días anteriores → propuesta de recolocar (pendiente de aprobación)
      const items = await weekItems(ws);
      for (const it of items.filter((i) => i.date < today && i.status === "planned" && i.kind !== "rest" && !i.locked)) {
        const draft = proposeReschedule(items, it.id, today, p.availability);
        if (draft) await createProposal(draft);
      }
      const c = await tbl("recovery_checkins").get(`checkin-${today}`);
      const ease = proposeEaseToday(items, today, c);
      if (ease) await createProposal(ease);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, ws, JSON.stringify(p.availability)]);

  const plan = useLive(async () => (await weekItems(ws)).filter((i) => i.date === today), [ws, today]) ?? [];
  const weekAll = useLive(() => weekItems(ws), [ws]) ?? [];
  const actual = useLive(async () => ({
    w: (await tbl("workout_sessions").where("date").equals(today).toArray()).filter((s) => active(s) && s.status === "completed"),
    e: (await tbl("endurance_sessions").where("date").equals(today).toArray()).filter(active),
  }), [today]);
  const cat = useLive(() => loadCatalog(), []);
  const bal = useLive(async () => (cat ? loadDayBalance(today, cat) : null), [cat, today]);
  const meals = useLive(async () => (await weekMeals(ws)).filter((m) => m.date === today || m.date === addDays(today, 1)), [ws, today]) ?? [];
  const logs = useLive(async () => (await tbl("food_logs").where("date").equals(today).toArray()).filter(active), [today]) ?? [];
  const shopping = useLive(async () => (await tbl("shopping_lists").where("weekStart").equals(ws).toArray()).find(active), [ws]);
  const checkin = useLive(() => tbl("recovery_checkins").get(`checkin-${today}`), [today]);
  const proposals = useLive(async () => (await all("proposals")).filter((x) => x.status === "pending").sort((a, b) => b.createdAt.localeCompare(a.createdAt)), []) ?? [];
  const targets = useLive(() => currentTargets(), []);
  const steps = useLive(() => tbl("daily_activity").get(`steps-${today}`), [today]);
  const glucose = useLive(async () => {
    const last = await tbl("cgm_readings").orderBy("ts").reverse().filter((x) => active(x) && x.kind === "historic").first();
    if (!last) return null;
    const end = Date.parse(last.ts) + 60000;
    const rs = (await readingsBetween(end - 864e5, end)).map((r) => ({ ms: Date.parse(r.ts), mgdl: r.valueMgdl, originalValue: r.originalValue, originalUnit: r.originalUnit }));
    return { last, m: computeMetrics(rs, end - 864e5, end, { veryLow: dia.veryLow, low: dia.targetLow, high: dia.targetHigh, veryHigh: dia.veryHigh }, 15) };
  }, [dia.veryLow, dia.targetLow, dia.targetHigh, dia.veryHigh]);

  const todayMeals = meals.filter((m) => m.date === today).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  const tomorrowBatch = cat ? meals.filter((m) => m.date === addDays(today, 1) && cat.recipe(m.recipeId)?.batchFriendly && (m.slot === "lunch" || m.slot === "dinner")) : [];
  const needed = cat && shopping ? (() => {
    const ids = new Set(todayMeals.flatMap((m) => cat.recipe(m.recipeId)?.ingredients.map((i) => i.foodId) ?? []));
    return shopping.items.filter((i) => ids.has(i.foodId) && !i.checked && i.grams - i.pantryGrams > 0);
  })() : [];
  const eaten = logs.reduce((a, l) => ({ c: a.c + l.totals.carbsAvailableG, k: a.k + l.totals.kcal, p: a.p + l.totals.proteinG }), { c: 0, k: 0, p: 0 });
  const done = weekAll.filter((i) => i.status === "done").length;
  const total = weekAll.filter((i) => i.kind !== "rest" && i.status !== "cancelled").length;
  const hour = new Date().getHours();

  return (
    <>
      <section className="hero" style={{ paddingTop: 22 }}>
        <div className="eyebrow">{formatDateEs(today, { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1 style={{ fontSize: "clamp(30px,6vw,48px)" }}>{hour < 13 ? "Buenos días" : hour < 21 ? "Buenas tardes" : "Buenas noches"}{p.displayName ? `, ${p.displayName}` : ""}.<br /><em>Esto es lo de hoy.</em></h1>
        <div className="stats">
          <div className="stat"><b>{done}/{total}</b><small>sesiones esta semana</small></div>
          <div className="stat"><b>{Math.round(eaten.c)} g</b><small>hidratos registrados hoy</small></div>
          <div className="stat"><b>{Math.round(eaten.p)} g</b><small>proteína hoy{targets?.proteinG ? ` (rango ${targets.proteinG[0]}–${targets.proteinG[1]})` : ""}</small></div>
          <div className="stat"><b>{steps?.steps ? steps.steps.toLocaleString("es-ES") : "—"}</b><small>pasos{p.stepsGoal ? ` · referencia ${p.stepsGoal.toLocaleString("es-ES")}` : ""}</small></div>
        </div>
        <EnergyKpi b={bal} />
      </section>

      {(!p.onboardingCompletedAt || p.draft) && (
        <Notice kind="info">Tu perfil está en borrador. <Link href="/onboarding"><b>Completa la configuración</b></Link> (2–3 min, todo opcional) para personalizar plan y menú.</Notice>
      )}

      <div className="quick" style={{ margin: "16px 0" }} role="group" aria-label="Acciones rápidas">
        <button onClick={() => setQuick("meal")}><Icon name="utensils" />Comida</button>
        <button onClick={() => setQuick("glucose")}><Icon name="drop" />Glucemia/evento</button>
        <button onClick={() => setQuick("activity")}><Icon name="run" />Entrenamiento</button>
        <button onClick={() => setQuick("weight")}><Icon name="scale" />Peso</button>
        <button onClick={() => setQuick("note")}><Icon name="note" />Nota</button>
        <button onClick={() => setQuick("checkin")}><Icon name="bed" />¿Cómo estás?</button>
      </div>

      <div className="grid g2">
        <Card title="Qué toca hoy" right={<Link className="btn sm ghost" href="/plan">Semana</Link>}>
          {plan.length ? (
            <div className="list">
              {plan.map((it) => (
                <div className="li wrap" key={it.id}>
                  <div className="grow">
                    <div className="t" style={{ textDecoration: it.status === "cancelled" ? "line-through" : undefined }}>{it.title}</div>
                    <div className="s">{it.kind === "rest" ? it.notes : `${it.durationMin} min · intensidad ${({ easy: "suave", moderate: "moderada", hard: "dura", rest: "—" } as const)[it.intensity]}`}{it.runSpec?.structure ? ` · ${it.runSpec.structure}` : ""}</div>
                  </div>
                  <div className="acts">
                  <span className={`badge ${it.status === "done" ? "ok" : it.status === "cancelled" ? "bad" : ""}`}>{STATUS[it.status]}</span>
                  {it.status !== "done" && it.status !== "cancelled" && it.kind === "strength" && it.templateId && <Link className="btn sm primary" href={`/entrenamiento/sesion?t=${it.templateId}&d=${it.dayIndex}&pi=${it.id}`}>Empezar</Link>}
                  {it.status !== "done" && it.status !== "cancelled" && it.kind !== "strength" && it.kind !== "rest" && <button className="btn sm" onClick={() => setQuick("activity")}>Registrar</button>}
                  {it.status === "planned" && it.kind !== "rest" && <button className="btn sm ghost" onClick={async () => { await patch("planned_items", it.id, { status: "cancelled" }); toast("Sesión cancelada (sin culpas)"); }}>Hoy no</button>}
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty title="Nada previsto hoy">Día libre o de descanso.</Empty>}
          {actual && (actual.w.length > 0 || actual.e.length > 0) && (
            <p className="small" style={{ marginBottom: 0 }}><b>Hecho hoy:</b> {[...actual.w.map((w) => w.title), ...actual.e.map((e) => `${SPORT_LABEL[e.sport]} ${Math.round(e.durationSec / 60)} min`)].join(" · ")}</p>
          )}
        </Card>

        <Card title="Comidas de hoy" right={<Link className="btn sm ghost" href="/nutricion">Menú</Link>}>
          {cat && todayMeals.length ? (
            <div className="list">
              {todayMeals.map((m) => {
                const r = cat.recipe(m.recipeId);
                const t = r ? recipeNutrition(r.ingredients, cat.food, m.servings, r.servings).totals : null;
                return (
                  <div className="li" key={m.id}>
                    <div className="grow">
                      <div className="s">{SLOT_LABEL[m.slot]}</div>
                      <div className="t">{r?.name}{m.servings !== 1 ? ` ×${m.servings.toLocaleString("es-ES")}` : ""}</div>
                      {t && <div className="s"><b>{Math.round(t.carbsAvailableG)} g hidratos</b> · {Math.round(t.kcal)} kcal · {Math.round(t.proteinG)} g prot. · {Math.round(t.fatG)} g grasa</div>}
                      {r && m.status === "planned" && <Portions recipeIngredients={r.ingredients} cat={cat} servings={m.servings} baseServings={r.servings} />}
                      {m.status === "replaced" && <div className="xs dim">Sustituida por lo que registraste</div>}
                    </div>
                    {m.status === "eaten" ? <span className="badge ok">Hecha</span> : m.status === "replaced" ? null : <ActionButton className="btn sm primary" icon="check" onRun={() => markEaten(m)} success="Comida registrada">Hecha</ActionButton>}
                    {m.status === "planned" && <Link className="btn sm ghost" href="/nutricion?tab=hoy" aria-label={`Cambiar ${r?.name}`}><Icon name="swap" /></Link>}
                  </div>
                );
              })}
            </div>
          ) : <Empty title="Sin menú" action={<Link className="btn primary" href="/nutricion?tab=menu">Generar menú</Link>} />}
          <p className="xs dim" style={{ marginBottom: 0 }}>Hidratos calculados con datos de referencia (estimación). No es una indicación de dosis.</p>
        </Card>

        <AdjustDayCard />
        {cat && <BalanceCard cat={cat} compact />}

        <Card title="Preparar o comprar">
          {tomorrowBatch.length === 0 && needed.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Nada pendiente para hoy.</p> : (
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {needed.slice(0, 6).map((n) => <li key={n.key}>Comprar: <b>{n.name}</b> (para hoy)</li>)}
              {needed.length > 6 && <li>…y {needed.length - 6} más</li>}
              {tomorrowBatch.map((m) => <li key={m.id}>Mañana: <b>{cat?.recipe(m.recipeId)?.name}</b> se puede dejar preparada hoy.</li>)}
            </ul>
          )}
          <Link className="btn sm ghost" href="/nutricion?tab=compra" style={{ marginTop: 8 }}><Icon name="cart" />Lista de la compra</Link>
        </Card>

        <Card title="Recuperación" sub="Percibida, no médica.">
          {checkin ? (
            <div className="small">Sueño <b>{checkin.sleepHours ?? "—"} h</b> (calidad {checkin.sleepQuality}/5) · energía {checkin.energy}/5 · fatiga {checkin.fatigue}/5 · agujetas {checkin.soreness}/5 · estrés {checkin.stress}/5{checkin.pain ? ` · dolor: ${checkin.pain}` : ""}</div>
          ) : <button className="btn" onClick={() => setQuick("checkin")}><Icon name="bed" />Hacer check-in (30 s)</button>}
        </Card>

        {dia.enabled && (
          <Card title="Glucosa (datos importados)" right={<Link className="btn sm ghost" href="/diabetes">Ver</Link>}>
            {glucose ? (
              <>
                <div className="grid g3">
                  <Kpi value={glucose.m.n ? `${Math.round(glucose.m.pct.in)} %` : "—"} label="en rango (últimas 24 h de datos)" source="calculated" />
                  <Kpi value={glucose.m.n ? `${Math.round(glucose.m.pctBelow70)} %` : "—"} label="por debajo del rango" source="calculated" />
                  <Kpi value={glucose.m.mean ? formatGlucose(glucose.m.mean, dia.unit) : "—"} label="media" source="calculated" />
                </div>
                <p className="xs dim" style={{ marginBottom: 0 }}>Hasta {new Date(glucose.last.ts).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })} · cobertura {Math.round(glucose.m.coveragePct)} % · <b>no es tiempo real</b>. Para decisiones usa tu lector/app oficial.</p>
              </>
            ) : <p className="small muted" style={{ margin: 0 }}>Sin datos importados. <Link href="/diabetes?tab=importar">Importar CSV</Link></p>}
            <Link className="btn sm ghost" href="/diabetes?tab=protocolo" style={{ marginTop: 8 }}><Icon name="shield" />Mi protocolo</Link>
          </Card>
        )}
      </div>

      <section style={{ marginTop: 22 }}>
        <div className="sec-head" style={{ margin: "0 0 10px" }}><h2>Cambios propuestos</h2><span className="pill">{proposals.length ? `${proposals.length} PENDIENTES` : "NINGUNO"}</span></div>
        {proposals.length ? <div className="stack">{proposals.slice(0, 4).map((x) => <ProposalCard key={x.id} p={x} />)}</div> : <p className="small muted">El sistema no propone cambios ahora mismo. Si algo cambia (sesión perdida, cansancio), lo verás aquí con su explicación.</p>}
      </section>

      <div className="row" style={{ marginTop: 18 }}>
        <SourceBadge source="manual" /><SourceBadge source="measured" /><SourceBadge source="imported" /><SourceBadge source="calculated" /><SourceBadge source="estimated" /><SourceBadge source="ai_draft" />
        <span className="xs dim">Así se distingue el origen de cada dato.</span>
      </div>
      <QuickLog kind={quick} onClose={() => setQuick(null)} />
    </>
  );
}

const VERDICT_TXT = { on_track: "Día en objetivo", over: "Por encima", under: "Te quedas corto", in_progress: "En curso", unknown: "" } as const;

/** KPI de energía: consumido vs gastado estimado, con la previsión del día. */
function EnergyKpi({ b }: { b: DayBalanceView | null | undefined }) {
  if (!b) return null;
  const e = b.energy;
  if (!e.ok) {
    return (
      <Link href="/ajustes?tab=perfil" className="energy-kpi muted" style={{ textDecoration: "none" }}>
        <small>Consumido vs gastado</small>
        <span className="small">Completa peso, altura y fecha de nacimiento para estimar tu gasto.</span>
      </Link>
    );
  }
  const max = Math.max(e.spent, e.projectedIntake, 1);
  const fmt = (n: number) => n.toLocaleString("es-ES");
  return (
    <Link href="/nutricion?tab=hoy" className="energy-kpi" data-v={e.verdict} style={{ textDecoration: "none" }} aria-label={`Consumido ${e.intake} kcal, gastado estimado ${e.spent} kcal. ${VERDICT_TXT[e.verdict]}`}>
      <div className="row between" style={{ flexWrap: "nowrap", alignItems: "baseline" }}>
        <small>Consumido vs gastado (kcal)</small>
        <span className={`badge ${e.verdict === "on_track" ? "ok" : e.verdict === "in_progress" ? "" : "warn"}`}>{VERDICT_TXT[e.verdict]}</span>
      </div>
      <div className="ek-nums">
        <div><b>{fmt(e.intake)}</b><span>consumido{e.projectedIntake > e.intake ? ` (+${fmt(e.projectedIntake - e.intake)} previsto)` : ""}</span></div>
        <div><b>{fmt(e.spent)}</b><span>gastado (est.){e.exercise ? ` · ${fmt(e.exercise)} ejercicio` : ""}</span></div>
        <div><b>{e.balance > 0 ? "+" : ""}{fmt(e.balance)}</b><span>balance ahora</span></div>
      </div>
      <div className="ek-bars" aria-hidden>
        <div className="ek-bar in"><i style={{ width: `${(e.intake / max) * 100}%` }} /><i className="plan" style={{ width: `${((e.projectedIntake - e.intake) / max) * 100}%` }} /></div>
        <div className="ek-bar out"><i style={{ width: `${(e.spent / max) * 100}%` }} /></div>
      </div>
      <span className="xs dim">{e.message}</span>
    </Link>
  );
}

