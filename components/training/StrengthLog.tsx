"use client";
import { useState } from "react";
import { ActionButton, Field, Modal, NumInput, useToast } from "@/components/ui";
import { useLive, useProfile, usePreferences } from "@/lib/db/hooks";
import { active, all, newId, patch } from "@/lib/db/repo";
import { tbl } from "@/lib/db/db";
import { localDate } from "@/lib/domain/time";
import { LIBRARY, MUSCLE_LABEL, EQUIPMENT_LABEL } from "@/lib/domain/training/library";
import { completeWorkout, logStrengthExercise } from "@/lib/services/training";
import type { PlannedItem, WorkoutSession } from "@/lib/db/types";

export function CompleteWorkoutModal({ planned, session, onClose }: { planned?: PlannedItem; session?: WorkoutSession; onClose: () => void }) {
  const [minutes,setMinutes] = useState<number | null>(session?.durationMin ?? null);
  const toast = useToast();
  return <Modal open title={`Completar ${session?.title ?? planned?.title ?? "sesión"}`} onClose={onClose} footer={<ActionButton className="btn primary" disabled={minutes != null && (!Number.isFinite(minutes) || minutes<=0 || minutes>600)} onRun={async()=>{
    await completeWorkout({ plannedItemId: planned?.id, sessionId: session?.id, durationMin: minutes });
    toast("Sesión completada: ya cuenta en Hoy"); onClose();
  }}>Confirmar sesión realizada</ActionButton>}>
    <div className="stack"><p>Se conservarán todas tus series y pesos anotados. Las series que no hayas registrado no se rellenarán con datos supuestos.</p>
      <Field label="Duración total real (min, opcional)" hint="Si no la indicas, la sesión cuenta como realizada pero su gasto queda sin estimar."><NumInput value={minutes} onChange={setMinutes} ariaLabel="Duración total real" /></Field>
    </div>
  </Modal>;
}

export function StrengthLogModal({ onClose, initialSessionId }: { onClose: () => void; initialSessionId?: string }) {
  const p = useProfile();
  const prefs=usePreferences();
  const recent=useLive(async()=>(await all("exercise_sets")).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(s=>s.exerciseId),[])??[];
  const [equipment,setEquipment]=useState("");
  const [onlyFavorites,setOnlyFavorites]=useState(false);
  const [requestId] = useState(newId);
  const [date,setDate] = useState(()=>localDate(Date.now(),p.timezone));
  const [q,setQ] = useState("");
  const [onlyCore,setOnlyCore] = useState(false);
  const [exerciseId,setExerciseId] = useState("");
  const [sets,setSets] = useState<number | null>(3);
  const [reps,setReps] = useState<number | null>(12);
  const [timed,setTimed]=useState(false);
  const [seconds,setSeconds]=useState<number|null>(30);
  const [weight,setWeight] = useState<number | null>(null);
  const [minutes,setMinutes] = useState<number | null>(null);
  const [sessionId,setSessionId] = useState(initialSessionId ?? "");
  const sessions = useLive(async()=>(await all("workout_sessions")).filter(s=>s.date===date && s.status!=="cancelled"),[date]);
  const toast = useToast();
  const query = q.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const list = LIBRARY.filter(e=>(!onlyCore || e.category==="core") && (!equipment || e.equipment.includes(equipment as never)) && (!onlyFavorites || prefs.favoriteExerciseIds?.includes(e.id)) && `${e.name} ${e.group} ${e.primary.map(m=>MUSCLE_LABEL[m]).join(" ")}`.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().includes(query)).sort((a,b)=>Number(!!prefs.favoriteExerciseIds?.includes(b.id))-Number(!!prefs.favoriteExerciseIds?.includes(a.id)) || (recent.indexOf(a.id)<0?9999:recent.indexOf(a.id))-(recent.indexOf(b.id)<0?9999:recent.indexOf(b.id)));
  const ex = LIBRARY.find(e=>e.id===exerciseId);
  return <Modal open title="Añadir ejercicio realizado" onClose={onClose} footer={<ActionButton className="btn primary" disabled={!ex || !Number.isInteger(sets) || !sets || sets<1 || sets>30 || (timed ? !Number.isInteger(seconds)||!seconds||seconds<1||seconds>3600 : !Number.isInteger(reps)||!reps||reps<1||reps>1000) || (weight!=null && (weight<0 || weight>1000)) || (minutes!=null && (minutes<=0 || minutes>600))} onRun={async()=>{
    await logStrengthExercise({ requestId,date,startedAt:new Date().toISOString(),exerciseId,sets:sets!,reps:reps!,seconds:timed?seconds:null,weightKg:weight,durationMin:minutes,sessionId:sessionId || undefined });
    toast(sessions?.find(s=>s.id===sessionId)?.status==="in_progress" ? "Series guardadas. Finaliza la sesión para contarla como completada." : "Ejercicio guardado: ya cuenta en Hoy y en tu progreso"); onClose();
  }}>Guardar ejercicio realizado</ActionButton>}>
    <div className="stack">
      <Field label="Buscar ejercicio"><input value={q} onChange={e=>{setQ(e.target.value);setExerciseId("");}} placeholder="Abdominales, crunch, remo…" /></Field>
      <label className="switch"><input type="checkbox" checked={onlyCore} onChange={e=>{setOnlyCore(e.target.checked);setExerciseId("");}} /><span>Solo abdominales y core</span></label>
      <Field label={`Ejercicio (${list.length} disponibles)`}><select aria-label="Ejercicio realizado" value={exerciseId} onChange={e=>setExerciseId(e.target.value)}><option value="">Elige un ejercicio…</option>{list.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
      <details><summary>Filtrar por material o favoritas</summary><Field label="Material"><select value={equipment} onChange={e=>setEquipment(e.target.value)}><option value="">Todo</option>{Object.entries(EQUIPMENT_LABEL).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></Field><label className="switch"><input type="checkbox" checked={onlyFavorites} onChange={e=>setOnlyFavorites(e.target.checked)}/>Solo favoritas</label></details>
      {ex && <ActionButton className="text-action" onRun={()=>patch("preferences","me",{favoriteExerciseIds:prefs.favoriteExerciseIds?.includes(ex.id)?prefs.favoriteExerciseIds.filter(id=>id!==ex.id):[...(prefs.favoriteExerciseIds??[]),ex.id]})}>{prefs.favoriteExerciseIds?.includes(ex.id)?"★ Quitar favorita":"☆ Guardar favorita"}</ActionButton>}
      {ex && <details><summary>Cómo hacer {ex.name}</summary>{ex.photos && <div className="exercise-preview">{[0,1].map(i=><img key={i} src={`/exercises/${ex.id}-${i}.jpg`} alt={`${ex.name}: ${i===0 ? "inicio" : "final"}`} />)}</div>}<ul className="small">{ex.cues.map(c=><li key={c}>{c}</li>)}</ul></details>}
      <div className="row"><button className="chip" aria-pressed={!timed} onClick={()=>setTimed(false)}>Repeticiones</button><button className="chip" aria-pressed={timed} onClick={()=>setTimed(true)}>Por tiempo</button></div>
      <div className="grid g3"><Field label="Series"><NumInput value={sets} onChange={setSets} ariaLabel="Series realizadas" /></Field>{timed?<Field label="Segundos por serie"><NumInput value={seconds} onChange={setSeconds} ariaLabel="Segundos realizados"/></Field>:<Field label="Repeticiones por serie"><NumInput value={reps} onChange={setReps} ariaLabel="Repeticiones realizadas" /></Field>}<Field label="Carga externa (kg, opcional)"><NumInput value={weight} onChange={setWeight} ariaLabel="Carga externa" /></Field></div>
      <Field label="Fecha"><input type="date" value={date} onChange={e=>{setDate(e.target.value);setSessionId("");}} /></Field>
      <Field label="Guardar en"><select value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value="">Actividad independiente</option>{sessions?.map(s=><option key={s.id} value={s.id}>{s.title}{s.status==="in_progress" ? " · en curso" : " · completada"}</option>)}</select></Field>
      <Field label={sessionId ? "Minutos adicionales (opcional)" : "Duración real (min, opcional)"} hint={sessionId ? "Déjalo vacío si ya estaban incluidos en la duración de la sesión. Si no se conoce el total, se conserva sin estimar." : "Sin duración se guardan las series, pero no se inventa un gasto calórico."}><NumInput value={minutes} onChange={setMinutes} ariaLabel="Duración del ejercicio" /></Field>
      <p className="xs dim">Se guardan las series realizadas. La duración total incluye los descansos y se utiliza para estimar el gasto.</p>
    </div>
  </Modal>;
}

export function WorkoutDetails({ session }: { session: WorkoutSession }) {
  const sets = useLive(async()=>(await tbl("exercise_sets").where("sessionId").equals(session.id).toArray()).filter(s=>active(s) && s.completed).sort((a,b)=>a.exerciseOrder-b.exerciseOrder || a.setIndex-b.setIndex),[session.id]) ?? [];
  const ids = [...new Set(sets.map(s=>s.exerciseId))];
  return <ul className="today-exercise-list">{ids.map(id=><li key={id}><b>{LIBRARY.find(e=>e.id===id)?.name ?? id}</b><span>{sets.filter(s=>s.exerciseId===id).map(s=>`${s.weightKg!=null ? `${s.weightKg} kg × ` : ""}${s.durationSec ? `${s.durationSec} s` : s.reps ?? "—"}`).join(" · ")}</span></li>)}{!ids.length && <li>Sesión confirmada sin detalle de series.</li>}</ul>;
}
