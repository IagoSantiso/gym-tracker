/** Operaciones de entrenamiento sobre IndexedDB (sesiones, series, última actuación). */
import { tbl } from "@/lib/db/db";
import { active, all, nowIso, patch, put, remove } from "@/lib/db/repo";
import type { ExerciseSet, PlannedItem, WorkoutSession } from "@/lib/db/types";
import { localDate } from "@/lib/domain/time";

export async function startSession(opts: { templateId: string | null; dayIndex: number | null; title: string; plannedItemId?: string | null; deload: boolean; adaptation: boolean }): Promise<WorkoutSession> {
  const now = nowIso();
  return put("workout_sessions", {
    date: localDate(), startedAt: now, endedAt: null, templateId: opts.templateId, dayIndex: opts.dayIndex, title: opts.title,
    status: "in_progress", plannedItemId: opts.plannedItemId ?? null, rpe: null, durationMin: null,
    deload: opts.deload, adaptation: opts.adaptation, notes: null, source: "manual",
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
  const it = items.find((i) => kinds.includes(i.kind) && (i.status === "planned" || i.status === "modified" || i.status === "moved") && !i.actualRef);
  if (it) await linkPlanned(it.id, { table, id });
}

export async function linkPlanned(plannedId: string, ref: { table: "workout_sessions" | "endurance_sessions"; id: string }) {
  await patch("planned_items", plannedId, { status: "done", actualRef: ref });
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
    const sets = (await tbl("exercise_sets").where("exerciseId").equals(ex).toArray()).filter((s) => active(s) && byId.has(s.sessionId));
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
