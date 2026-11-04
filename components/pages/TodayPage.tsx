"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ActionButton, Card, Icon, Kpi, Modal, SourceBadge } from "@/components/ui";
import { QuickLog, type QuickKind } from "@/components/log/QuickLog";
import { MealRow } from "@/components/nutrition/MealCard";
import { currentMeal } from "@/lib/domain/today";
import { SPORT_LABEL } from "@/lib/domain/training/endurance";
import { stockGrams } from "@/lib/domain/nutrition/kitchen";
import { buildShoppingList } from "@/lib/domain/nutrition/shopping";
import { AdjustDayCard, BalanceCard } from "@/components/pages/NutritionPage";
import { ProposalCard } from "@/components/plan/ProposalCard";
import { useDiabetes, useLive, useProfile, useTable } from "@/lib/db/hooks";
import { tbl } from "@/lib/db/db";
import { active, all, patch } from "@/lib/db/repo";
import { addDays, formatDateEs, localDate, minutesOfDay, weekStartOf } from "@/lib/domain/time";
import { computeMetrics } from "@/lib/domain/cgm/metrics";
import { formatGlucose } from "@/lib/domain/units";
import { SLOT_LABEL, SLOT_ORDER } from "@/lib/domain/nutrition/recipes";
import { proposeEaseToday, proposeReschedule } from "@/lib/domain/planning/adapt";
import { createProposal, ensurePlan, weekItems } from "@/lib/services/plan";
import { loadCatalog, weekMeals } from "@/lib/services/nutrition";
import { agpPdfReports, readingsBetween } from "@/lib/services/cgm";


export function TodayPage() {
  const p = useProfile();
  const pdfReports = useLive(() => agpPdfReports(), []) ?? [];
  const dia = useDiabetes();
  const [now,setNow] = useState(Date.now);
  useEffect(()=>{
    const update=()=>setNow(Date.now());
    const timer=window.setInterval(update,60000);
    document.addEventListener("visibilitychange",update);
    return ()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",update);};
  },[]);
  const today = localDate(now, p.timezone);
  const ws = weekStartOf(today);
  const [quick, setQuick] = useState<QuickKind>(null);
  const [registerOpen,setRegisterOpen] = useState(false);
  const [adjustOpen,setAdjustOpen] = useState(false);
  const [insightsOpen,setInsightsOpen] = useState(false);
  const pantry = useTable("pantry_items") ?? [];

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
    strength: (await tbl("workout_sessions").where("date").equals(today).toArray()).filter(s=>active(s) && s.status==="completed"),
    endurance: (await tbl("endurance_sessions").where("date").equals(today).toArray()).filter(active),
  }),[today]);
  const cat = useLive(() => loadCatalog(), []);
  const meals = useLive(async () => (await weekMeals(ws)).filter((m) => m.date === today || m.date === addDays(today, 1)), [ws, today]) ?? [];
  const logs = useLive(async () => (await tbl("food_logs").where("date").equals(today).toArray()).filter(active), [today]) ?? [];
  const checkin = useLive(() => tbl("recovery_checkins").get(`checkin-${today}`), [today]);
  const proposals = useLive(async () => (await all("proposals")).filter((x) => x.status === "pending").sort((a, b) => b.createdAt.localeCompare(a.createdAt)), []) ?? [];
  const steps = useLive(() => tbl("daily_activity").get(`steps-${today}`), [today]);
  const glucose = useLive(async () => {
    if (!insightsOpen || !dia.enabled) return null;
    const last = await tbl("cgm_readings").orderBy("ts").reverse().filter((x) => active(x) && x.kind === "historic").first();
    if (!last) return null;
    const end = Date.parse(last.ts) + 60000;
    const rs = (await readingsBetween(end - 864e5, end)).map((r) => ({ ms: Date.parse(r.ts), mgdl: r.valueMgdl, originalValue: r.originalValue, originalUnit: r.originalUnit }));
    return { last, m: computeMetrics(rs, end - 864e5, end, { veryLow: dia.veryLow, low: dia.targetLow, high: dia.targetHigh, veryHigh: dia.veryHigh }, 15) };
  }, [insightsOpen, dia.enabled, dia.veryLow, dia.targetLow, dia.targetHigh, dia.veryHigh]);

  const todayMeals = meals.filter((m) => m.date === today).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  const needed = cat ? buildShoppingList(todayMeals.filter(m=>m.status==="planned" && !logs.some(l=>l.slot===m.slot)),cat.recipe,cat.food,[...stockGrams(pantry,today)].map(([foodId,grams])=>({foodId,grams}))).filter(i=>i.grams>i.pantryGrams) : [];
  const done = weekAll.filter((i) => i.status === "done").length;
  const total = weekAll.filter((i) => i.kind !== "rest" && i.status !== "cancelled").length;

  const next = currentMeal(todayMeals, logs.map(l=>l.slot), minutesOfDay(now,p.timezone));
  const remainingMeals = todayMeals.filter(m=>m.id!==next?.id && m.status==="planned" && !logs.some(l=>l.slot===m.slot));
  const pendingMovement = plan.filter(i=>i.status!=="done" && i.status!=="cancelled");
  const soon = pantry.filter(p=>(p.quantityKnown===false || p.grams>0 || (p.portions??0)>0) && p.useBy && p.useBy>=today && p.useBy<=addDays(today,2));
  const openQuick = (kind: QuickKind) => {setRegisterOpen(false);setQuick(kind);};

  return <div className="today-hub">
    <header className="today-header">
      <div><p className="eyebrow">{formatDateEs(today,{weekday:"long",day:"numeric",month:"long"})}</p><h1>Hoy</h1></div>
      <button className="btn primary" onClick={()=>setRegisterOpen(true)}><Icon name="plus" />Registrar</button>
    </header>
    <div className="today-agenda">
      <section aria-labelledby="today-movement" className="today-movement card">
        <div className="today-section-head"><h2 id="today-movement">Movimiento</h2><Link className="text-action" href="/plan">Ver semana</Link></div>
        {pendingMovement.length ? pendingMovement.map(it=><div className="today-session" key={it.id}>
          <h3>{it.title}</h3><p className="small muted">{it.kind==="rest" ? "Un día para recuperar." : `${it.durationMin} min · ${it.intensity==="hard" ? "intensidad alta" : it.intensity==="moderate" ? "intensidad moderada" : "suave"}`}</p>
          {it.kind==="strength" && it.templateId ? <Link className="btn" href={`/entrenamiento/sesion?t=${it.templateId}&d=${it.dayIndex}&pi=${it.id}`}>Empezar sesión</Link> : it.kind!=="rest" ? <button className="btn" onClick={()=>setQuick("activity")}>Registrar entrenamiento</button> : null}
          {it.kind!=="rest" && <details className="quiet-disclosure"><summary>Ver detalles o cambiar el plan</summary><div className="stack">
            {it.runSpec?.structure && <p className="small">{it.runSpec.structure}</p>}{it.notes && <p className="small">{it.notes}</p>}
            <Link href="/plan" className="text-action">Ajustar en el plan</Link><ActionButton className="btn sm ghost" onRun={()=>patch("planned_items",it.id,{status:"cancelled"})} success="Sesión cancelada">Hoy no</ActionButton>
          </div></details>}
        </div>) : <p className="small muted">{plan.some(i=>i.status==="done") ? "Lo previsto de hoy ya está hecho." : "No tienes entrenamiento pendiente."}</p>}
        {actual && (actual.strength.length+actual.endurance.length)>0 && <details className="quiet-disclosure"><summary>Entrenamientos registrados hoy <span>{actual.strength.length+actual.endurance.length}</span></summary><ul className="small">{actual.strength.map(w=><li key={w.id}>{w.title}</li>)}{actual.endurance.map(e=><li key={e.id}>{SPORT_LABEL[e.sport]} · {Math.round(e.durationSec/60)} min</li>)}</ul><Link className="text-action" href="/entrenamiento?tab=historial">Ver historial</Link></details>}
      </section>
      <section aria-labelledby="today-food" className="today-food card">
        <div className="today-section-head"><h2 id="today-food">Comidas</h2><Link href="/nutricion?tab=menu" className="text-action">Ver menú</Link></div>
        {cat && next ? <MealRow e={next} cat={cat} featured /> : <div className="today-empty">
          <p>{logs.length ? "Tus comidas están registradas." : todayMeals.length ? "No quedan comidas previstas." : "Todavía no tienes menú."}</p>
          {!todayMeals.length && <Link href="/nutricion?tab=menu" className="btn">Preparar mi menú</Link>}
          <button className="text-action" onClick={()=>setQuick("meal")}>Registrar lo que he comido</button>
        </div>}
        {cat && remainingMeals.length>0 && <details className="today-other-meals"><summary>Otras comidas pendientes <span>{remainingMeals.length}</span></summary>{remainingMeals.map(m=><MealRow key={m.id} e={m} cat={cat} />)}</details>}
        {logs.length>0 && <details className="quiet-disclosure"><summary>Registrado hoy <span>{logs.length}</span></summary><ul className="today-log-list">{logs.map(l=><li key={l.id}><span className="xs dim">{SLOT_LABEL[l.slot]}</span><b>{l.title}</b><span className="small">{Math.round(l.totals.carbsAvailableG)} g hidratos · <SourceBadge source={l.source} /></span></li>)}</ul><Link href="/nutricion?tab=hoy" className="text-action">Ver o corregir registros</Link></details>}
      </section>
    </div>
    {(soon.length>0 || needed.length>0) && <section className="today-kitchen-note" aria-label="Para las comidas de hoy">
      <Icon name={soon.length ? "utensils" : "cart"} /><div>{soon.length>0 ? <><b>Usar pronto</b><p>{soon.slice(0,2).map(p=>p.name).join(" · ")}{soon.length>2 ? ` y ${soon.length-2} más` : ""}</p></> : <><b>Antes de cocinar</b><p>Revisa {needed.length} ingredientes que no figuran en tus existencias.</p></>}</div>
      <Link className="text-action" href={soon.length ? "/nutricion?tab=cocina" : "/nutricion?tab=compra"}>{soon.length ? "Mi cocina" : "Ver compra"}</Link>
    </section>}
    <div className="today-support"><button className="text-action" onClick={()=>setAdjustOpen(true)}><Icon name="chat" />Necesito ajustar el día</button>{dia.enabled && <Link className="text-action" href="/diabetes">Glucosa importada</Link>}</div>
    {dia.enabled && pdfReports[0] && <p className="xs dim today-pdf">Informe PDF · {pdfReports[0].reportSummary?.periodText ?? "periodo no reconocido"}. <Link href="/diabetes?tab=resumen">Ver métricas del informe</Link>. No es tiempo real.</p>}
    {proposals.length>0 && <details className="today-disclosure"><summary>{proposals.length} {proposals.length===1 ? "propuesta para revisar" : "propuestas para revisar"}</summary><div className="stack">{proposals.map(pr=><ProposalCard key={pr.id} p={pr} />)}</div></details>}
    <details className="today-disclosure" onToggle={e=>setInsightsOpen(e.currentTarget.open)}><summary>Balance y salud</summary>
      {insightsOpen && <div className="stack">{cat && <BalanceCard cat={cat} compact />}
        <Card title="Recuperación" sub="Percibida, no médica.">{checkin ? <p className="small">Sueño {checkin.sleepHours??"—"} h · energía {checkin.energy}/5 · fatiga {checkin.fatigue}/5{checkin.pain ? ` · dolor: ${checkin.pain}` : ""}</p> : <button className="btn" onClick={()=>setQuick("checkin")}>Hacer check-in</button>}<p className="small muted">Pasos registrados: {steps?.steps?.toLocaleString("es-ES")??"sin datos"} · sesiones esta semana: {done}/{total}</p></Card>
        {dia.enabled && <Card title="Glucosa importada">{glucose ? <><div className="grid g3"><Kpi value={glucose.m.n ? `${Math.round(glucose.m.pct.in)} %` : "—"} label="en rango (últimas 24 h de datos)" source="calculated" /><Kpi value={glucose.m.mean ? formatGlucose(glucose.m.mean,dia.unit) : "—"} label="media" source="calculated" /></div><p className="xs dim">Hasta {new Date(glucose.last.ts).toLocaleString("es-ES")} · cobertura {Math.round(glucose.m.coveragePct)} % · no es tiempo real. Para decisiones usa tu lector/app oficial.</p></> : <p className="small">{pdfReports[0] ? "El PDF contiene un resumen, no lecturas individuales." : "No hay lecturas importadas."}</p>}<Link className="text-action" href="/diabetes">Ver datos</Link> · <Link className="text-action" href="/diabetes?tab=protocolo">Mi protocolo</Link></Card>}
      </div>}
    </details>
    {(!p.onboardingCompletedAt || p.draft) && <details className="quiet-disclosure today-setup"><summary>Personalizar mi día</summary><p className="small muted">Tu perfil está en borrador. Completarlo ayuda a personalizar el plan y el menú.</p><Link href="/onboarding" className="text-action">Revisar mi perfil</Link></details>}
    <Modal open={registerOpen} onClose={()=>setRegisterOpen(false)} title="¿Qué quieres registrar?"><div className="register-choices">{([{kind:"meal",label:"Comida",icon:"utensils"},{kind:"activity",label:"Entrenamiento",icon:"run"},{kind:"glucose",label:"Glucemia o evento",icon:"drop"},{kind:"weight",label:"Peso",icon:"scale"},{kind:"checkin",label:"Cómo me encuentro",icon:"bed"},{kind:"note",label:"Nota",icon:"note"}] as const).map(a=><button key={a.kind} onClick={()=>openQuick(a.kind)}><Icon name={a.icon} />{a.label}</button>)}</div></Modal>
    <Modal open={adjustOpen} onClose={()=>setAdjustOpen(false)} title="Ajustar mi día"><AdjustDayCard embedded /></Modal>
    <QuickLog kind={quick} onClose={()=>setQuick(null)} />
  </div>;
}
