/** Operaciones de entrenamiento sobre IndexedDB (sesiones, series, última actuación). */
import { getDb, tbl } from "@/lib/db/db";
import { active, all, nowIso, patch, put, remove } from "@/lib/db/repo";
import type { ExerciseSet, PlannedItem, WorkoutSession } from "@/lib/db/types";
import { localDate } from "@/lib/domain/time";
import { serial } from "./lock";
import { findExercise } from "@/lib/domain/training/library";

export async function startSession(opts: { templateId: string | null; dayIndex: number | null; title: string; plannedItemId?: string | null; deload: boolean; adaptation: boolean }): Promise<WorkoutSession> {
  return serial("training", async () => {
    const existing = await findOpenSession(opts.templateId, opts.dayIndex);
    if (existing) return existing;
    const now = nowIso();
    return put("workout_sessions", {
      date: localDate(), startedAt: now, endedAt: null, templateId: opts.templateId, dayIndex: opts.dayIndex, title: opts.title,
      status: "in_progress", plannedItemId: opts.plannedItemId ?? null, rpe: null, durationMin: null,
      deload: opts.deload, adaptation: opts.adaptation, notes: null, source: "manual",
    });
  });
}

export async function findOpenSession(templateId: string | null, dayIndex: number | null): Promise<WorkoutSession | undefined> {
  const today = localDate();
  const open = (await tbl("workout_sessions").where("status").equals("in_progress").toArray()).filter(active);
  return open.find((s) => s.date === today && (s.templateId ?? null) === templateId && (s.dayIndex ?? null) === dayIndex);
}

export async function upsertSet(s: Omit<ExerciseSet, "createdAt" | "updatedAt" | "id"> & { id?: string }) {
  return put("exercise_sets", s);
}

export async function finishSession(sessionId: string, opts: { rpe: number | null; notes: string | null }) {
  const s = await tbl("workout_sessions").get(sessionId);
  if (!s) return;
  const end = nowIso();
  const durationMin = Math.max(1, Math.round((Date.parse(end) - Date.parse(s.startedAt)) / 60000));
  await patch("workout_sessions", sessionId, { status: "completed", endedAt: end, durationMin, rpe: opts.rpe, notes: opts.notes });
  if (s.plannedItemId) await linkPlanned(s.plannedItemId, { table: "workout_sessions", id: sessionId });
  else await autoLinkPlanned("strength", sessionId, "workout_sessions", s.date);
}

/** Enlaza la actividad real con el elemento del plan del día (si existe uno compatible). */
export async function autoLinkPlanned(kind: PlannedItem["kind"] | PlannedItem["kind"][], id: string, table: "workout_sessions" | "endurance_sessions", date: string) {
  const kinds = Array.isArray(kind) ? kind : [kind];
  const items = (await tbl("planned_items").where("date").equals(date).toArray()).filter(active);
  const session = table === "workout_sessions" ? await tbl("workout_sessions").get(id) : null;
  const it = items.find((i) => kinds.includes(i.kind) && (i.status === "planned" || i.status === "modified" || i.status === "moved") && !i.actualRef && (!session || (!!session.templateId && i.templateId === session.templateId && i.dayIndex === session.dayIndex)));
  if (it) await linkPlanned(it.id, { table, id });
}

export async function linkPlanned(plannedId: string, ref: { table: "workout_sessions" | "endurance_sessions"; id: string }) {
  await patch("planned_items", plannedId, { status: "done", actualRef: ref });
}

/** Recupera enlaces ausentes en registros anteriores, solo con coincidencia de rutina y día. */
export async function reconcileCompletedWorkouts(date: string) {
  return serial("training", async () => {
    const db = getDb();
    await db.transaction("rw", [db.table("workout_sessions"), db.table("planned_items"), db.outbox], async () => {
      const sessions = (await tbl("workout_sessions").where("date").equals(date).toArray()).filter(s=>active(s) && s.status==="completed");
      for (const s of sessions) {
        if (s.plannedItemId) {
          const plan = await tbl("planned_items").get(s.plannedItemId);
          if (active(plan) && plan.date===date && plan.kind==="strength" && ["planned","modified","moved"].includes(plan.status) && !plan.actualRef) await linkPlanned(plan.id,{table:"workout_sessions",id:s.id});
        } else await autoLinkPlanned("strength",s.id,"workout_sessions",date);
      }
    });
  });
}

export async function discardSession(sessionId: string) {
  const sets = (await tbl("exercise_sets").where("sessionId").equals(sessionId).toArray()).filter(active);
  await remove("exercise_sets", sets.map((s) => s.id));
  await remove("workout_sessions", sessionId);
}

export interface LastPerformance {
  sessionId: string;
  date: string;
  sets: ExerciseSet[];
}

/** Última sesión completada (distinta de la actual) con series de cada ejercicio. */
export async function lastPerformance(exerciseIds: string[], excludeSessionId?: string): Promise<Record<string, LastPerformance>> {
  const sessions = (await all("workout_sessions")).filter((s) => s.status === "completed" && s.id !== excludeSessionId);
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const out: Record<string, LastPerformance> = {};
  for (const ex of exerciseIds) {
    const sets = (await tbl("exercise_sets").where("exerciseId").equals(ex).toArray()).filter((s) => active(s) && s.completed && !s.isWarmup && byId.has(s.sessionId));
    const bySession = new Map<string, ExerciseSet[]>();
    sets.forEach((s) => bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s]));
    const best = [...bySession.keys()].sort((a, b) => {
      const sa = byId.get(a)!;
      const sb = byId.get(b)!;
      return sb.date.localeCompare(sa.date) || sb.startedAt.localeCompare(sa.startedAt);
    })[0];
    if (best) out[ex] = { sessionId: best, date: byId.get(best)!.date, sets: bySession.get(best)!.sort((a, b) => a.setIndex - b.setIndex) };
  }
  return out;
}

/** Confirmación retrospectiva: conserva las series reales; nunca inventa cargas ni repeticiones. */
export async function completeWorkout(opts: { plannedItemId?: string; sessionId?: string; durationMin: number | null }) {
  if (opts.durationMin != null && (!Number.isFinite(opts.durationMin) || opts.durationMin <= 0 || opts.durationMin > 600)) throw new Error("Revisa la duración (1–600 min).");
  return serial("training", async () => {
    const db = getDb();
    return db.transaction("rw", [db.table("workout_sessions"), db.table("planned_items"), db.outbox], async () => {
      const plan = opts.plannedItemId ? await tbl("planned_items").get(opts.plannedItemId) : undefined;
      if (opts.plannedItemId && (!active(plan) || plan.kind !== "strength" || plan.status === "cancelled")) throw new Error("Esta sesión ya no está disponible.");
      const sessions = await all("workout_sessions");
      const linked = plan?.actualRef?.table === "workout_sessions" ? plan.actualRef.id : undefined;
      let session = sessions.find(s => s.id === (opts.sessionId ?? linked));
      if (opts.sessionId && !session) throw new Error("No se encontró la sesión.");
      if (!session && plan) session = sessions.find(s => s.plannedItemId === plan.id || (s.date === plan.date && s.templateId === plan.templateId && s.dayIndex === plan.dayIndex && s.status !== "cancelled"));
      if (!session && !plan) throw new Error("Elige una sesión.");
      if (session?.status === "cancelled") throw new Error("La sesión está cancelada.");
      if (session?.status === "completed") {
        if (plan) await linkPlanned(plan.id, { table: "workout_sessions", id: session.id });
        return session.durationMin === opts.durationMin ? session : (await patch("workout_sessions", session.id, { durationMin: opts.durationMin }))!;
      }
      const end = nowIso();
      const saved = session
        ? (await patch("workout_sessions", session.id, { status: "completed", endedAt: end, durationMin: opts.durationMin, plannedItemId: plan?.id ?? session.plannedItemId }))!
        : await put("workout_sessions", { date: plan!.date, startedAt: end, endedAt: end, templateId: plan!.templateId ?? null, dayIndex: plan!.dayIndex ?? null, title: plan!.title, status: "completed", plannedItemId: plan!.id, durationMin: opts.durationMin, rpe: null, deload: false, adaptation: false, source: "manual", notes: "Sesión confirmada como realizada; sin inventar series no registradas." });
      if (plan) await linkPlanned(plan.id, { table: "workout_sessions", id: saved.id });
      else await autoLinkPlanned("strength", saved.id, "workout_sessions", saved.date);
      return saved;
    });
  });
}

/** Ejercicio extra ya realizado. requestId hace idempotente un reintento del formulario. */
export async function logStrengthExercise(opts: { requestId: string; date: string; startedAt: string; exerciseId: string; sets: number; reps: number; seconds?: number | null; weightKg: number | null; durationMin: number | null; sessionId?: string }) {
  const ex = findExercise(opts.exerciseId);
  if (!ex || !Number.isInteger(opts.sets) || opts.sets < 1 || opts.sets > 30 || (opts.seconds != null ? (!Number.isInteger(opts.seconds) || opts.seconds<1 || opts.seconds>3600) : (!Number.isInteger(opts.reps) || opts.reps < 1 || opts.reps > 1000)) || (opts.weightKg != null && (!Number.isFinite(opts.weightKg) || opts.weightKg < 0 || opts.weightKg > 1000)) || (opts.durationMin != null && (!Number.isFinite(opts.durationMin) || opts.durationMin <= 0 || opts.durationMin > 600))) throw new Error("Revisa ejercicio, series, repeticiones, peso y duración.");
  return serial("training", async () => {
    const db = getDb();
    return db.transaction("rw", [db.table("workout_sessions"), db.table("exercise_sets"), db.outbox], async () => {
      if (await tbl("exercise_sets").get(`${opts.requestId}:0`)) return;
      let session = opts.sessionId ? await tbl("workout_sessions").get(opts.sessionId) : undefined;
      if (opts.sessionId && (!active(session) || session.status === "cancelled" || session.date !== opts.date)) throw new Error("Elige una sesión válida de ese día.");
      if (!session) session = await put("workout_sessions", { id: opts.requestId, date: opts.date, startedAt: opts.startedAt, endedAt: opts.startedAt, title: ex.name, status: "completed", templateId: null, dayIndex: null, plannedItemId: null, durationMin: opts.durationMin, rpe: null, deload: false, adaptation: false, source: "manual" });
      else if (opts.durationMin && session.durationMin != null) await patch("workout_sessions", session.id, { durationMin: session.durationMin + opts.durationMin });
      const previous = (await tbl("exercise_sets").where("sessionId").equals(session.id).toArray()).filter(active);
      const order = Math.max(-1, ...previous.map(s => s.exerciseOrder)) + 1;
      for (let j = 0; j < opts.sets; j++) await upsertSet({ id: `${opts.requestId}:${j}`, sessionId: session.id, exerciseId: ex.id, exerciseOrder: order, setIndex: j, weightKg: opts.weightKg, reps: opts.seconds ? null : opts.reps, durationSec:opts.seconds ?? null, rir: null, completed: true, completedAt: opts.startedAt, isWarmup: false, targetRepsMin: null, targetRepsMax: null, notes: "Ejercicio añadido manualmente" });
    });
  });
}

/** Corrections are atomic and scoped to the selected session. */
export async function editWorkout(id: string, input: {title:string;durationMin:number|null;sets:import("@/lib/db/types").ExerciseSet[]}) {
  if(!input.title.trim() || (input.durationMin!=null && (!Number.isFinite(input.durationMin)||input.durationMin<=0||input.durationMin>600))) throw new Error("Revisa nombre y duración.");
  for(const s of input.sets) {
    if(s.sessionId!==id || (s.weightKg!=null&&(!Number.isFinite(s.weightKg)||s.weightKg<0||s.weightKg>1000)) || (s.reps!=null&&(!Number.isInteger(s.reps)||s.reps<1||s.reps>1000)) || (s.durationSec!=null&&(!Number.isInteger(s.durationSec)||s.durationSec<1||s.durationSec>3600))) throw new Error("Revisa los valores de las series.");
  }
  return serial("training",async()=>{
    const db=getDb();
    await db.transaction("rw",[db.table("workout_sessions"),db.table("exercise_sets"),db.outbox],async()=>{
      const session=await tbl("workout_sessions").get(id);if(!active(session))throw new Error("Sesión no disponible.");
      await patch("workout_sessions",id,{title:input.title.trim(),durationMin:input.durationMin});
      for(const s of input.sets) {
        const saved=await tbl("exercise_sets").get(s.id);if(!active(saved)||saved.sessionId!==id)throw new Error("La serie ha cambiado. Vuelve a abrir la sesión.");
        await patch("exercise_sets",s.id,{weightKg:s.weightKg,reps:s.reps,durationSec:s.durationSec,completed:s.completed,completedAt:s.completed?(saved.completedAt??new Date().toISOString()):null});
      }
    });
  });
}
