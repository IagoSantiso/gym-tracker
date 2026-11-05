"use client";
import { EditWorkoutModal, EditEnduranceModal } from "@/components/training/EditWorkout";
import type { EnduranceSession } from "@/lib/db/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ActionButton, Card, Icon, Kpi, Modal, SourceBadge } from "@/components/ui";
import { QuickLog, type QuickKind } from "@/components/log/QuickLog";
import { MealRow } from "@/components/nutrition/MealCard";
import { reconcileCompletedWorkouts } from "@/lib/services/training";
import { FoodDiary } from "@/components/nutrition/FoodDiary";
import { TodayEnergy } from "@/components/nutrition/TodayEnergy";
import { CompleteWorkoutModal, WorkoutDetails } from "@/components/training/StrengthLog";
import { findExercise } from "@/lib/domain/training/library";
import type { PlannedItem, WorkoutSession } from "@/lib/db/types";
import { SPORT_LABEL } from "@/lib/domain/training/endurance";
import { stockGrams } from "@/lib/domain/nutrition/kitchen";
import { buildShoppingList } from "@/lib/domain/nutrition/shopping";
import { AdjustDayCard, BalanceCard } from "@/components/pages/NutritionPage";
import { ProposalCard } from "@/components/plan/ProposalCard";
import { useDiabetes, useLive, useProfile, useTable } from "@/lib/db/hooks";
import { tbl } from "@/lib/db/db";
import { active, all, patch } from "@/lib/db/repo";
import { addDays, formatDateEs, localDate, weekStartOf } from "@/lib/domain/time";
import { computeMetrics } from "@/lib/domain/cgm/metrics";
import { formatGlucose } from "@/lib/domain/units";
import { SLOT_LABEL, SLOT_ORDER } from "@/lib/domain/nutrition/recipes";
import { proposeEaseToday, proposeReschedule } from "@/lib/domain/planning/adapt";
import { createProposal, ensurePlan, weekItems } from "@/lib/services/plan";
import { loadCatalog, weekMeals } from "@/lib/services/nutrition";
import { agpPdfReports, readingsBetween } from "@/lib/services/cgm";


export function TodayPage() {
  const p = useProfile();
  const [editWorkout,setEditWorkout]=useState<WorkoutSession|null>(null);
  const [editEndurance,setEditEndurance]=useState<EnduranceSession|null>(null);
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
  const [complete,setComplete] = useState<{planned?: PlannedItem; session?: WorkoutSession} | null>(null);
  const templates = useTable("workout_templates") ?? [];
  const [registerOpen,setRegisterOpen] = useState(false);
  const [adjustOpen,setAdjustOpen] = useState(false);
  const [insightsOpen,setInsightsOpen] = useState(false);
  const pantry = useTable("pantry_items") ?? [];

  useEffect(() => {
    void (async () => {
      await ensurePlan(today);
      await reconcileCompletedWorkouts(today);
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
    strength: (await tbl("workout_sessions").where("date").equals(today).toArray()).filter(s=>active(s) && s.status!=="cancelled"),
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
  const needed = cat ? buildShoppingList(todayMeals.filter(m=>m.status==="planned" && !logs.some(l=>l.mealEntryId===m.id)),cat.recipe,cat.food,[...stockGrams(pantry,today)].map(([foodId,grams])=>({foodId,grams}))).filter(i=>i.grams>i.pantryGrams) : [];
  const done = weekAll.filter((i) => i.status === "done").length;
  const total = weekAll.filter((i) => i.kind !== "rest" && i.status !== "cancelled").length;

  const pendingMovement = plan.filter(i=>i.status!=="done" && i.status!=="cancelled");
  const soon = pantry.filter(p=>(p.quantityKnown===false || p.grams>0 || (p.portions??0)>0) && p.useBy && p.useBy>=today && p.useBy<=addDays(today,2));
  const openQuick = (kind: QuickKind) => {setRegisterOpen(false);setQuick(kind);};

  return <div className="today-hub">
    <header className="today-header">
      <div><p className="eyebrow">{formatDateEs(today,{weekday:"long",day:"numeric",month:"long"})}</p><h1>Hoy</h1></div>
      <button className="btn primary" onClick={()=>setRegisterOpen(true)}><Icon name="plus" />Registrar</button>
    </header>
    <TodayEnergy date={today} />
    <div className="daily-summary" aria-label="Resumen del día"><span><b>{logs.length}</b> comidas registradas</span><a href="#today-movement">{actual?.strength.some(s=>s.status==="completed") ? `${actual.strength.filter(s=>s.status==="completed").map(s=>s.title).join(" · ")} ✓` : actual?.endurance.length ? `${actual.endurance.map(e=>SPORT_LABEL[e.sport]).join(" · ")} ✓` : "Ejercicio pendiente"}</a></div>
    <div className="today-agenda">
      <div className="stack"><FoodDiary date={today} compact onAdd={()=>setQuick("meal")} />
      {cat && todayMeals.some(m=>m.status==="planned") && <details className="card"><summary>Menú pendiente</summary>{todayMeals.filter(m=>m.status==="planned").map(m=><details className="today-meal today-item" key={m.id}><summary>{cat.recipe(m.recipeId)?.name??"Plato previsto"}</summary><MealRow e={m} cat={cat}/></details>)}</details>}</div>
      <section aria-labelledby="today-movement" className="today-movement card">
        <div className="today-section-head"><h2 id="today-movement">Ejercicios de hoy</h2><button className="text-action" onClick={()=>setQuick("activity")}>+ Añadir actividad</button></div>
        {pendingMovement.filter(it=>!actual?.strength.some(s=>s.plannedItemId===it.id || (s.templateId===it.templateId && s.dayIndex===it.dayIndex))).map(it=>{
          const routine = templates.find(t=>t.id===it.templateId)?.days[it.dayIndex ?? -1];
          const open = actual?.strength.find(s=>s.templateId===it.templateId && s.dayIndex===it.dayIndex && s.status==="in_progress");
          return <details className="today-session today-item" key={it.id}>
            <summary><span><b>{it.title}</b><span className="s">{it.kind==="rest" ? "Recuperación" : `${routine ? `${routine.items.length} ejercicios · ` : ""}${it.durationMin} min previstos`}</span></span><span className="badge">{open ? "Sin finalizar" : "Pendiente"}</span></summary>
            {routine && <ul className="small">{routine.items.map((e,i)=><li key={i}>{findExercise(e.exerciseId)?.name ?? e.exerciseId} · {e.sets} × {e.repsLabel ?? `${e.repsMin}–${e.repsMax}`}</li>)}</ul>}
            {it.kind==="strength" ? <div className="row">{it.templateId && <Link className="text-action" href={`/entrenamiento/sesion?t=${it.templateId}&d=${it.dayIndex}&pi=${it.id}`}>{open ? "Continuar registro" : "Abrir sesión"}</Link>}<button className="btn sm primary" onClick={()=>setComplete({planned:it,session:open})}>Ya la he realizado</button></div> : it.kind!=="rest" ? <button className="text-action" onClick={()=>setQuick("activity")}>Registrar actividad realizada</button> : null}
            {it.notes && <p className="small muted">{it.notes}</p>}
          </details>;
        })}
        {actual?.strength.map(s=><details key={s.id} className="today-session today-item" data-status={s.status}>
          <summary><span><b>{s.title}</b><span className="s">{s.durationMin ? `${s.durationMin} min` : "Duración sin registrar"}</span></span><span className={`badge ${s.status==="completed" ? "ok" : "warn"}`}>{s.status==="completed" ? "Completada" : "Sin finalizar"}</span></summary>
          <WorkoutDetails session={s} />
          {s.status==="in_progress" && <button className="btn sm primary" onClick={()=>setComplete({session:s,planned:plan.find(i=>i.id===s.plannedItemId)})}>Ya la he realizado</button>}
          <div className="row">{s.status==="completed" && <button className="text-action" onClick={()=>setEditWorkout(s)}>Corregir sesión</button>}
          <Link className="text-action" href="/entrenamiento?tab=historial">Ver registro</Link></div>
        </details>)}
        {actual?.endurance.map(e=><details key={e.id} className="today-session today-item"><summary><span><b>{SPORT_LABEL[e.sport]}</b><span className="s">{Math.round(e.durationSec/60)} min{e.distanceM ? ` · ${(e.distanceM/1000).toLocaleString("es-ES")} km` : ""}</span></span><span className="badge ok">Completada</span></summary><button className="text-action" onClick={()=>setEditEndurance(e)}>Corregir actividad</button></details>)}
        {!pendingMovement.length && !actual?.strength.length && !actual?.endurance.length && <p className="small muted">No hay entrenamientos previstos. Puedes añadir lo que hayas hecho.</p>}
        <div className="today-section-foot"><Link className="text-action" href="/entrenamiento?tab=semana">Ver semana</Link></div>
      </section>

    </div>
    {(soon.length>0 || needed.length>0) && <section className="today-kitchen-note" aria-label="Para las comidas de hoy">
      <Icon name={soon.length ? "utensils" : "cart"} /><div>{soon.length>0 ? <><b>Usar pronto</b><p>{soon.slice(0,2).map(p=>p.name).join(" · ")}{soon.length>2 ? ` y ${soon.length-2} más` : ""}</p></> : <><b>Antes de cocinar</b><p>Revisa {needed.length} ingredientes que no figuran en tus existencias.</p></>}</div>
      <Link className="text-action" href={soon.length ? "/nutricion?tab=cocina" : "/nutricion?tab=compra"}>{soon.length ? "Mi cocina" : "Ver compra"}</Link>
    </section>}
    <div className="today-support"><button className="text-action" onClick={()=>setAdjustOpen(true)}><Icon name="chat" />Necesito ajustar el día</button>{dia.enabled && <Link className="text-action" href="/diabetes">Glucosa importada</Link>}</div>
    {dia.enabled && pdfReports[0] && <p className="xs dim today-pdf">Informe PDF · {pdfReports[0].reportSummary?.periodText ?? "periodo no reconocido"}. <Link href="/diabetes?tab=resumen">Ver métricas del informe</Link>. No es tiempo real.</p>}
    {proposals.length>0 && <details className="today-disclosure"><summary>{proposals.length} {proposals.length===1 ? "propuesta para revisar" : "propuestas para revisar"}</summary><div className="stack">{proposals.map(pr=><ProposalCard key={pr.id} p={pr} />)}</div></details>}
    <details className="today-disclosure" onToggle={e=>setInsightsOpen(e.currentTarget.open)}><summary>Nutrición y salud en detalle</summary>
      {insightsOpen && <div className="stack">{cat && <BalanceCard cat={cat} compact />}
        <Card title="Recuperación" sub="Percibida, no médica.">{checkin ? <p className="small">Sueño {checkin.sleepHours??"—"} h · energía {checkin.energy}/5 · fatiga {checkin.fatigue}/5{checkin.pain ? ` · dolor: ${checkin.pain}` : ""}</p> : <button className="btn" onClick={()=>setQuick("checkin")}>Hacer check-in</button>}<p className="small muted">Pasos registrados: {steps?.steps?.toLocaleString("es-ES")??"sin datos"} · sesiones esta semana: {done}/{total}</p></Card>
        {dia.enabled && <Card title="Glucosa importada">{glucose ? <><div className="grid g3"><Kpi value={glucose.m.n ? `${Math.round(glucose.m.pct.in)} %` : "—"} label="en rango (últimas 24 h de datos)" source="calculated" /><Kpi value={glucose.m.mean ? formatGlucose(glucose.m.mean,dia.unit) : "—"} label="media" source="calculated" /></div><p className="xs dim">Hasta {new Date(glucose.last.ts).toLocaleString("es-ES")} · cobertura {Math.round(glucose.m.coveragePct)} % · no es tiempo real. Para decisiones usa tu lector/app oficial.</p></> : <p className="small">{pdfReports[0] ? "El PDF contiene un resumen, no lecturas individuales." : "No hay lecturas importadas."}</p>}<Link className="text-action" href="/diabetes">Ver datos</Link> · <Link className="text-action" href="/diabetes?tab=protocolo">Mi protocolo</Link></Card>}
      </div>}
    </details>
    {(!p.onboardingCompletedAt || p.draft) && <details className="quiet-disclosure today-setup"><summary>Personalizar mi día</summary><p className="small muted">Tu perfil está en borrador. Completarlo ayuda a personalizar el plan y el menú.</p><Link href="/onboarding" className="text-action">Revisar mi perfil</Link></details>}
    <Modal open={registerOpen} onClose={()=>setRegisterOpen(false)} title="¿Qué quieres registrar?"><div className="register-choices">{([{kind:"meal",label:"Comida",icon:"utensils"},{kind:"strength",label:"Fuerza / abdominales",icon:"dumbbell"},{kind:"activity",label:"Cardio / otra actividad",icon:"run"},{kind:"glucose",label:"Glucemia o evento",icon:"drop"},{kind:"weight",label:"Peso",icon:"scale"},{kind:"checkin",label:"Cómo me encuentro",icon:"bed"},{kind:"note",label:"Nota",icon:"note"}] as const).map(a=><button key={a.kind} onClick={()=>openQuick(a.kind)}><Icon name={a.icon} />{a.label}</button>)}</div></Modal>
    <Modal open={adjustOpen} onClose={()=>setAdjustOpen(false)} title="Ajustar mi día"><AdjustDayCard embedded /></Modal>
    {complete && <CompleteWorkoutModal planned={complete.planned} session={complete.session} onClose={()=>setComplete(null)} />}
    {editWorkout&&<EditWorkoutModal session={editWorkout} onClose={()=>setEditWorkout(null)}/>}
    {editEndurance&&<EditEnduranceModal session={editEndurance} onClose={()=>setEditEndurance(null)}/>}
    <QuickLog kind={quick} onClose={()=>setQuick(null)} />
  </div>;
}
