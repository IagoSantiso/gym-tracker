/**
 * Propuestas de adaptación (reglas deterministas). Nunca se aplican solas: devuelven
 * una propuesta con motivo, datos usados, supuestos, confianza y operaciones + inversas.
 * Principios: no compensar sesiones perdidas acumulando volumen; no juntar sesiones duras;
 * mantener descanso; respetar bloqueos.
 */
import type { PlannedItem, Proposal, ProposalOp, RecoveryCheckIn } from "@/lib/db/types";
import { addDays, formatDateEs } from "@/lib/domain/time";
import { hasErrors, validateWeek } from "./rules";

export type ProposalDraft = Omit<Proposal, "id" | "createdAt" | "updatedAt" | "status" | "decidedAt" | "decisionReason">;

const upd = (id: string, changes: Record<string, unknown>): ProposalOp => ({ op: "update", table: "planned_items", id, changes });

function base(p: Partial<ProposalDraft> & Pick<ProposalDraft, "kind" | "title" | "summary" | "ops" | "inverse">): ProposalDraft {
  return {
    domain: "plan", reasons: [], dataUsed: [], assumptions: [], warnings: [], confidence: "medium",
    origin: "rules", requiresApproval: true, expiresAt: null, ...p,
  };
}

/** Mueve una sesión perdida al siguiente día válido de la semana (sin acumular dos el mismo día). */
export function proposeReschedule(items: PlannedItem[], itemId: string, today: string, availability?: Record<number, number>): ProposalDraft | null {
  const it = items.find((i) => i.id === itemId);
  if (!it || it.locked) return null;
  const weekEnd = addDays(it.weekStart, 6);
  for (let d = addDays(today, 1); d <= weekEnd; d = addDays(d, 1)) {
    const busy = items.some((x) => x.id !== it.id && x.date === d && x.kind !== "rest" && x.status !== "cancelled");
    const lockedDay = items.some((x) => x.date === d && x.locked);
    if (busy || lockedDay) continue;
    const moved = items.map((x) => (x.id === it.id ? { ...x, date: d } : x)).filter((x) => !(x.date === d && x.kind === "rest"));
    if (hasErrors(validateWeek(moved, { weekStart: it.weekStart, availability }))) continue;
    const restOnDay = items.find((x) => x.date === d && x.kind === "rest");
    const ops: ProposalOp[] = [upd(it.id, { date: d, status: "moved", originalDate: it.originalDate ?? it.date })];
    const inverse: ProposalOp[] = [upd(it.id, { date: it.date, status: it.status, originalDate: it.originalDate ?? null })];
    if (restOnDay) {
      ops.push(upd(restOnDay.id, { status: "cancelled" }));
      inverse.push(upd(restOnDay.id, { status: restOnDay.status }));
    }
    return base({
      kind: "reschedule",
      title: `Mover "${it.title}" al ${formatDateEs(d)}`,
      summary: "Se recoloca la sesión sin juntarla con otra ni encadenar días duros.",
      reasons: [`La sesión del ${formatDateEs(it.date)} no se hizo.`, "El día propuesto está libre y no rompe las reglas de descanso."],
      dataUsed: ["Plan vigente de la semana", "Reglas R1, R2, R5"],
      assumptions: ["Tienes disponibilidad ese día según tu perfil."],
      warnings: restOnDay ? ["Ese día era tu descanso; la semana sigue teniendo al menos otro día sin sesiones duras."] : [],
      confidence: "high",
      ops,
      inverse,
    });
  }
  return base({
    kind: "skip",
    title: `Dejar pasar "${it.title}"`,
    summary: "No hay hueco válido esta semana: es mejor no recuperarla que acumular carga.",
    reasons: ["Recolocarla rompería el descanso o juntaría sesiones duras."],
    dataUsed: ["Plan vigente de la semana"],
    assumptions: [],
    confidence: "high",
    ops: [upd(it.id, { status: "cancelled" })],
    inverse: [upd(it.id, { status: it.status })],
  });
}

/** Recuperación percibida baja → suavizar la sesión dura de hoy. */
export function proposeEaseToday(items: PlannedItem[], today: string, checkin: RecoveryCheckIn | undefined): ProposalDraft | null {
  if (!checkin) return null;
  const reasons: string[] = [];
  if ((checkin.fatigue ?? 0) >= 4) reasons.push(`Fatiga percibida alta (${checkin.fatigue}/5).`);
  if (checkin.sleepHours != null && checkin.sleepHours < 6) reasons.push(`Has dormido ${checkin.sleepHours} h.`);
  if ((checkin.sleepQuality ?? 5) <= 2) reasons.push("Calidad de sueño baja.");
  if ((checkin.soreness ?? 0) >= 4) reasons.push("Agujetas/dolor muscular alto.");
  if (checkin.pain) reasons.push("Has anotado dolor: si es articular o agudo, consulta antes de entrenar esa zona.");
  if (!reasons.length) return null;
  const hard = items.filter((i) => i.date === today && i.intensity === "hard" && i.status === "planned" && !i.locked);
  if (!hard.length) return null;
  const ops: ProposalOp[] = [];
  const inverse: ProposalOp[] = [];
  for (const h of hard) {
    const newMin = Math.max(20, Math.round(h.durationMin * 0.6));
    ops.push(upd(h.id, { intensity: "easy", durationMin: newMin, status: "modified", notes: `Versión suave (${newMin} min): ${h.kind === "strength" ? "mismos ejercicios, 1–2 series menos y 3–4 reps en recámara" : "ritmo fácil, Z1–Z2"}.` }));
    inverse.push(upd(h.id, { intensity: h.intensity, durationMin: h.durationMin, status: h.status, notes: h.notes ?? null }));
  }
  return base({
    kind: "ease_today",
    title: "Hoy, versión suave",
    summary: "Reducir intensidad y volumen de la sesión dura de hoy según tu check-in.",
    reasons,
    dataUsed: ["Check-in de recuperación de hoy", "Plan de hoy"],
    assumptions: ["La recuperación percibida es una señal subjetiva, no una medida médica."],
    warnings: ["Si tienes síntomas que te preocupan, prioriza descansar y consultar."],
    confidence: "medium",
    ops,
    inverse,
  });
}

/** Poco tiempo hoy → versión exprés de la sesión. */
export function proposeShorten(items: PlannedItem[], today: string, minutes: number): ProposalDraft | null {
  const targets = items.filter((i) => i.date === today && i.status === "planned" && i.kind !== "rest" && !i.locked && i.durationMin > minutes);
  if (!targets.length) return null;
  return base({
    kind: "shorten",
    title: `Sesión exprés de ${minutes} min`,
    summary: "Mantener lo esencial (ejercicios principales o rodaje) en el tiempo disponible.",
    reasons: [`Has indicado ${minutes} min disponibles hoy.`],
    dataUsed: ["Plan de hoy"],
    assumptions: ["En fuerza se priorizan los primeros ejercicios (multiarticulares)."],
    confidence: "high",
    ops: targets.map((t) => upd(t.id, { durationMin: minutes, status: "modified", notes: t.kind === "strength" ? "Exprés: primeros 3 ejercicios, series de trabajo sin aproximaciones extra." : "Exprés: misma intensidad prevista, menos duración." })),
    inverse: targets.map((t) => upd(t.id, { durationMin: t.durationMin, status: t.status, notes: t.notes ?? null })),
  });
}

/** Tablas y campos que una propuesta puede tocar (nunca configuración clínica). */
export const PROPOSAL_WHITELIST: Record<string, string[] | "*"> = {
  planned_items: ["date", "status", "intensity", "durationMin", "notes", "title", "originalDate", "runSpec", "kind", "templateId", "dayIndex", "loadsLegs", "weekStart", "sortOrder", "locked", "source"],
  meal_entries: ["recipeId", "servings", "status", "replacedFrom", "notes", "date", "slot", "mealPlanId", "locked"],
  experiments: "*",
  workout_templates: "*",
  preferences: ["deloadActiveWeek", "adaptationMode", "deloadEveryWeeks"],
  goals: ["weightLossRatePct", "notes"],
  recipes: "*",
  recipe_ingredients: "*",
  user_notes: "*",
};

export function validateOps(ops: ProposalOp[]): string[] {
  const errs: string[] = [];
  for (const o of ops) {
    const allowed = PROPOSAL_WHITELIST[o.table];
    if (!allowed) {
      errs.push(`Tabla no permitida: ${o.table}`);
      continue;
    }
    const fields = o.op === "update" ? Object.keys(o.changes) : o.op === "create" ? Object.keys(o.record) : [];
    if (allowed !== "*") for (const f of fields) if (!allowed.includes(f) && f !== "id") errs.push(`Campo no permitido: ${o.table}.${f}`);
  }
  return errs;
}
