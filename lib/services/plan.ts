/** Plan semanal: generación, propuestas (aplicar / rechazar / revertir) y estado. */
import { tbl } from "@/lib/db/db";
import { active, all, audit, bulkPut, nowIso, patch, put, remove } from "@/lib/db/repo";
import type { PlannedItem, Proposal, ProposalOp, RunSpec, TableName } from "@/lib/db/types";
import { GENERATOR_VERSION, generateWeek } from "@/lib/domain/planning/generator";
import { validateOps, type ProposalDraft } from "@/lib/domain/planning/adapt";
import { addDays, weekStartOf } from "@/lib/domain/time";
import { buildRunPlan } from "@/lib/domain/training/endurance";
import { scanDeep } from "@/lib/domain/safety/guardrails";

export async function weekItems(weekStart: string): Promise<PlannedItem[]> {
  return (await tbl("planned_items").where("weekStart").equals(weekStart).toArray()).filter(active).sort((a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder);
}

/** Sesiones de carrera de la semana a partir del objetivo (o mantenimiento si no hay). */
async function runSessionsFor(weekStart: string): Promise<RunSpec[]> {
  const goals = await tbl("goals").get("me");
  const profile = await tbl("profiles").get("me");
  const level = profile?.experience === "advanced" || profile?.experience === "intermediate" ? "intermediate" : "beginner";
  const rg = goals?.raceGoal;
  if (rg?.distanceKm && rg.date) {
    const weeks = Math.max(4, Math.min(20, Math.round((Date.parse(rg.date) - Date.parse(weekStart)) / (7 * 864e5)) + 1));
    const plan = buildRunPlan({ distanceKm: rg.distanceKm, weeks, daysPerWeek: 3, currentWeeklyMin: 120, level, ref: profile?.runRef });
    return plan[0].sessions;
  }
  return [
    { type: "easy", durationMin: 40, hrZone: "Z2" },
    { type: "long", durationMin: 60, hrZone: "Z2" },
    ...(level === "intermediate" ? [{ type: "tempo" as const, durationMin: 40, hrZone: "Z3–Z4", structure: "2 × 10′ a ritmo umbral cómodo" }] : []),
  ];
}

export async function generatePlan(weekStart: string, opts: { keepLocked?: boolean } = {}): Promise<{ notes: string[] }> {
  const profile = await tbl("profiles").get("me");
  const prefs = await tbl("preferences").get("me");
  const template = prefs?.activeTemplateId ? await tbl("workout_templates").get(prefs.activeTemplateId) : undefined;
  const existing = await weekItems(weekStart);
  const lockedItems = opts.keepLocked !== false ? existing.filter((i) => i.locked) : [];
  const planWeek = (await tbl("plan_weeks").where("weekStart").equals(weekStart).toArray()).find(active);
  const lockedDays = planWeek?.lockedDays ?? [];
  const prevItems = await weekItems(addDays(weekStart, -7));
  const prevLast = prevItems.filter((i) => i.date === addDays(weekStart, -1));
  const { items, notes } = generateWeek({
    weekStart,
    availability: profile?.availability ?? { 0: 60, 1: 60, 2: 60, 3: 60, 4: 60, 5: 90, 6: 90 },
    template: template ? { id: template.id, days: template.days } : null,
    runSessions: await runSessionsFor(weekStart),
    bike: { perWeek: profile?.bike?.perWeek ?? 1, minutes: profile?.bike?.typicalMin ?? 60 },
    lockedItems: lockedItems.map((i) => ({ ...i })),
    lockedDays,
    prevWeekHardLastDay: prevLast.some((i) => i.intensity === "hard" && i.status !== "cancelled"),
  });
  // Reemplaza lo no bloqueado ni hecho
  const keep = new Set(existing.filter((i) => i.locked || i.status === "done" || lockedDays.includes(i.date)).map((i) => i.id));
  await remove("planned_items", existing.filter((i) => !keep.has(i.id)).map((i) => i.id));
  const fresh = items.filter((i) => !lockedItems.some((l) => l.date === i.date && l.title === i.title));
  await bulkPut("planned_items", fresh.map((i) => ({ ...i, weekStart, status: "planned" as const, locked: false, originalDate: i.date, actualRef: null, source: "rules" as const })));
  const original = (await weekItems(weekStart)).map(({ date, kind, title, intensity, durationMin, templateId, dayIndex, runSpec, loadsLegs, sortOrder, notes: n }) => ({ date, kind, title, intensity, durationMin, templateId, dayIndex, runSpec, loadsLegs, sortOrder, notes: n }));
  if (planWeek) await patch("plan_weeks", planWeek.id, { original, generatedAt: nowIso(), generatorVersion: GENERATOR_VERSION, notes: notes.join(" ") || null });
  else await put("plan_weeks", { weekStart, original, generatorVersion: GENERATOR_VERSION, generatedAt: nowIso(), lockedDays: [], notes: notes.join(" ") || null });
  await audit("plan_generated", { weekStart });
  return { notes };
}

export async function ensurePlan(date: string) {
  const ws = weekStartOf(date);
  if (!(await weekItems(ws)).length) await generatePlan(ws);
}

export async function toggleDayLock(weekStart: string, date: string) {
  const pw = (await tbl("plan_weeks").where("weekStart").equals(weekStart).toArray()).find(active);
  if (!pw) return;
  const days = pw.lockedDays.includes(date) ? pw.lockedDays.filter((d) => d !== date) : [...pw.lockedDays, date];
  await patch("plan_weeks", pw.id, { lockedDays: days });
}

/* ───────── Propuestas ───────── */

export async function createProposal(d: ProposalDraft): Promise<Proposal | { error: string }> {
  const errs = validateOps(d.ops);
  if (errs.length) return { error: errs.join("; ") };
  const scan = scanDeep(d);
  if (!scan.ok) return { error: "La propuesta contiene contenido clínico no permitido y se ha descartado." };
  // Evita duplicados pendientes del mismo tipo
  const pending = (await all("proposals")).filter((p) => p.status === "pending" && p.kind === d.kind && JSON.stringify(p.ops) === JSON.stringify(d.ops));
  if (pending.length) return pending[0];
  return put("proposals", { ...d, status: "pending", decidedAt: null, decisionReason: null });
}

async function applyOps(ops: ProposalOp[]) {
  for (const o of ops) {
    const t = o.table as TableName;
    if (o.op === "update") await patch(t, o.id, o.changes as never);
    else if (o.op === "create") await put(t, o.record as never);
    else await remove(t, o.id);
  }
}

/** Calcula la inversa real de los "create" (borrar lo creado). */
function inverseFor(p: Proposal, createdIds: string[]): ProposalOp[] {
  return [...(p.inverse ?? []), ...createdIds.map((id, i) => ({ op: "delete" as const, table: (p.ops.filter((o) => o.op === "create")[i] as { table: string }).table, id }))];
}

export async function acceptProposal(id: string): Promise<{ ok: boolean; error?: string }> {
  const p = await tbl("proposals").get(id);
  if (!p || p.status !== "pending") return { ok: false, error: "La propuesta ya no está pendiente." };
  const errs = validateOps(p.ops);
  if (errs.length) return { ok: false, error: errs.join("; ") };
  const created: string[] = [];
  const ops = p.ops.map((o) => {
    if (o.op !== "create") return o;
    const rid = (o.record.id as string) ?? crypto.randomUUID();
    created.push(rid);
    return { ...o, record: { ...o.record, id: rid } };
  });
  await applyOps(ops);
  await patch("proposals", id, { status: "accepted", decidedAt: nowIso(), inverse: inverseFor(p, created) });
  await afterMealChanges(ops);
  await audit("proposal_accepted", { kind: p.kind, origin: p.origin });
  return { ok: true };
}

/** Si la propuesta toca el menú, recalcula la lista de la compra de las semanas afectadas. */
async function afterMealChanges(ops: ProposalOp[]) {
  const ids = ops.filter((o) => o.table === "meal_entries" && o.op !== "create").map((o) => (o as { id: string }).id);
  if (!ids.length) return;
  const { refreshShoppingList } = await import("./nutrition");
  const weeks = new Set<string>();
  for (const id of ids) {
    const e = await tbl("meal_entries").get(id);
    if (e) weeks.add(weekStartOf(e.date));
  }
  for (const w of weeks) await refreshShoppingList(w);
}

export async function rejectProposal(id: string, reason: string | null) {
  await patch("proposals", id, { status: "rejected", decidedAt: nowIso(), decisionReason: reason });
  await audit("proposal_rejected", { id });
}

export async function revertProposal(id: string) {
  const p = await tbl("proposals").get(id);
  if (!p || p.status !== "accepted" || !p.inverse) return;
  await applyOps(p.inverse);
  await patch("proposals", id, { status: "reverted", decidedAt: nowIso() });
  await afterMealChanges(p.inverse);
  await audit("proposal_reverted", { id });
}
