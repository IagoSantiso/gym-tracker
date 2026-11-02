"use client";
/**
 * Ejecutores de herramientas del asistente en el CLIENTE (local-first): leen IndexedDB y devuelven
 * resúmenes mínimos; las de escritura crean PROPUESTAS validadas (nunca aplican cambios).
 */
import { tbl } from "@/lib/db/db";
import { active, all } from "@/lib/db/repo";
import type { ConsentKind, PlannedItem, ProposalOp } from "@/lib/db/types";
import { TOOL_BY_NAME, validateToolInput, type ToolCall, type ProposeSchedule, type TrainingPlanDraft, type MealPlanDraft, type RecipeDraft, type SaveNote, type Alternatives, type Meta, type LogMealEstimate, type MealVariant } from "./tools";
import type { z } from "zod";
import { addDays, localDate, minutesOfDay, weekStartOf } from "@/lib/domain/time";
import { summarizeByExercise } from "@/lib/domain/training/progression";
import { LIBRARY, alternativesFor, findExercise } from "@/lib/domain/training/library";
import { acwr, dailyLoads } from "@/lib/domain/training/endurance";
import { validateWeek } from "@/lib/domain/planning/rules";
import { computeMetrics, byTimeBlock } from "@/lib/domain/cgm/metrics";
import { DEFAULT_EPISODE_RULES, detectEpisodes } from "@/lib/domain/cgm/episodes";
import { activityGlucose, observations, summarizeGroups } from "@/lib/domain/cgm/context";
import { recipeNutrition, allergensOf, nutrientsFor, addTotals, EMPTY_TOTALS } from "@/lib/domain/nutrition/calc";
import { portionLines } from "@/lib/domain/nutrition/portions";
import { dayBalance } from "@/lib/domain/nutrition/balance";
import type { NutrientTotals } from "@/lib/db/types";
import { loadDayBalance } from "@/lib/services/balance";
import { scanDeep } from "@/lib/domain/safety/guardrails";
import { loadCatalog, weekMeals } from "@/lib/services/nutrition";
import { createProposal } from "@/lib/services/plan";
import { readingsBetween } from "@/lib/services/cgm";

export interface ToolOutcome {
  content: string;
  isError?: boolean;
  display?: unknown;
}

const r1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);
const since = (days: number) => addDays(localDate(), -days);

async function consented(kind: ConsentKind) {
  if (kind === "ai_assistant") return !!(await tbl("consents").get("ai_assistant"))?.granted;
  return !!(await tbl("consents").get(kind))?.granted && !!(await tbl("consents").get("ai_assistant"))?.granted;
}

function metaToProposal(meta: z.infer<typeof Meta>) {
  return { assumptions: meta.assumptions, dataUsed: meta.data_used, warnings: meta.warnings, confidence: meta.confidence };
}

const READ: Record<string, (input: never) => Promise<unknown>> = {
  async get_user_profile_summary() {
    const [p, g, pr] = await Promise.all([tbl("profiles").get("me"), tbl("goals").get("me"), tbl("preferences").get("me")]);
    const tpl = pr?.activeTemplateId ? await tbl("workout_templates").get(pr.activeTemplateId) : null;
    const training = await consented("ai_training");
    return {
      goals: { primary: g?.primaryGoal, weight_loss_rate_pct_week: g?.weightLossRatePct, strength_priority: g?.strengthPriority, endurance_priority: g?.endurancePriority, race_goal: g?.raceGoal ?? null },
      preferences: { meals_per_day: pr?.mealsPerDay, cooking_time_min: pr?.cookingTimeMin, budget: pr?.budget, allergies: pr?.allergies, intolerances: pr?.intolerances, excluded_foods: pr?.excludedFoods, active_routine: tpl?.name, adaptation_mode: pr?.adaptationMode },
      training: training ? { experience: p?.experience, equipment: p?.equipment, availability_min_by_weekday_mon0: p?.availability, injuries_or_limits: p?.injuries ?? null, steps_goal: p?.stepsGoal, bike: p?.bike, has_recent_run_reference: !!p?.runRef } : "no autorizado",
      timezone: p?.timezone,
    };
  },
  async get_training_history({ days }: { days: number }) {
    const from = since(days);
    const sessions = (await all("workout_sessions")).filter((s) => s.status === "completed" && s.date >= from);
    const dates = Object.fromEntries(sessions.map((s) => [s.id, s.date]));
    const sets = (await all("exercise_sets")).filter((s) => dates[s.sessionId]);
    const hist = summarizeByExercise(sets, dates);
    const end = (await all("endurance_sessions")).filter((e) => e.date >= from);
    return {
      period_days: days,
      strength_sessions: sessions.map((s) => ({ date: s.date, title: s.title, duration_min: s.durationMin, rpe: s.rpe, deload: s.deload })),
      by_exercise: Object.entries(hist).map(([id, h]) => ({ exercise_id: id, name: findExercise(id)?.name ?? id, sessions: h.length, last_date: h.at(-1)?.date, last_top_kg: h.at(-1)?.topWeight, best_e1rm_estimate_kg: r1(Math.max(0, ...h.map((x) => x.best1RM ?? 0))) || null })),
      endurance: end.map((e) => ({ date: e.date, sport: e.sport, type: e.sessionType, min: Math.round(e.durationSec / 60), km: e.distanceM ? r1(e.distanceM / 1000) : null, rpe: e.rpe, avg_hr: e.avgHr, source: e.source })),
    };
  },
  async get_weekly_schedule({ week_offset }: { week_offset: number }) {
    const ws = addDays(weekStartOf(localDate()), week_offset * 7);
    const items = (await tbl("planned_items").where("weekStart").equals(ws).toArray()).filter(active);
    const pw = (await tbl("plan_weeks").where("weekStart").equals(ws).toArray()).find(active);
    const p = await tbl("profiles").get("me");
    return {
      week_start: ws, today: localDate(),
      items: items.map((i) => ({ id: i.id, date: i.date, kind: i.kind, title: i.title, intensity: i.intensity, duration_min: i.durationMin, status: i.status, locked: i.locked, run: i.runSpec ?? null })),
      original_plan: (pw?.original ?? []).map((o) => ({ date: o.date, title: o.title, intensity: o.intensity })),
      locked_days: pw?.lockedDays ?? [],
      availability_min_by_weekday_mon0: p?.availability,
      rule_violations: validateWeek(items, { weekStart: ws, availability: p?.availability }).map((v) => v.message),
    };
  },
  async get_activity_summary({ days }: { days: number }) {
    const from = since(days);
    const end = await all("endurance_sessions");
    const str = (await all("workout_sessions")).filter((s) => s.status === "completed");
    const recent = end.filter((e) => e.date >= from);
    const by: Record<string, { sessions: number; minutes: number; km: number }> = {};
    recent.forEach((e) => {
      const b = (by[e.sport] ??= { sessions: 0, minutes: 0, km: 0 });
      b.sessions++; b.minutes += e.durationSec / 60; b.km += (e.distanceM ?? 0) / 1000;
    });
    const steps = (await all("daily_activity")).filter((d) => d.date >= from && d.steps);
    const ac = acwr(dailyLoads(end, str), localDate());
    return {
      period_days: days,
      by_sport: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { sessions: v.sessions, minutes: Math.round(v.minutes), km: r1(v.km) }])),
      strength_sessions: str.filter((s) => s.date >= from).length,
      avg_steps: steps.length ? Math.round(steps.reduce((a, d) => a + (d.steps ?? 0), 0) / steps.length) : null,
      load_srpe_approx: { acute_7d: ac.acute, chronic_weekly: ac.chronicWeekly, ratio: ac.ratio, note: ac.note },
    };
  },
  async get_exercise_alternatives(input: z.infer<typeof Alternatives>) {
    const src = findExercise(input.exercise_id);
    if (!src) return { error: "exercise_id desconocido", valid_ids: LIBRARY.map((e) => e.id) };
    const alts = alternativesFor(src.id, { max: 4, available: input.available_equipment ?? undefined, avoidEquipment: input.reason === "pain" ? [] : src.equipment })
      .filter((a) => input.reason !== "pain" || a.difficulty <= src.difficulty);
    return { for: { id: src.id, name: src.name, primary: src.main }, alternatives: alts.map((a) => ({ exercise_id: a.id, name: a.name, equipment: a.equipment, primary: a.main, difficulty: a.difficulty, caution: a.caution ?? null })) };
  },
  async get_food_inventory() {
    const cat = await loadCatalog();
    const pr = await tbl("preferences").get("me");
    const pantry = await all("pantry_items");
    return {
      allergies: pr?.allergies, intolerances: pr?.intolerances, excluded_foods: pr?.excludedFoods,
      recipes: cat.recipes.map((r) => {
        const t = recipeNutrition(r.ingredients, cat.food, 1, r.servings).totals;
        return { recipe_id: r.id, name: r.name, slots: r.slots, kcal: Math.round(t.kcal), carbs_available_g: Math.round(t.carbsAvailableG), protein_g: Math.round(t.proteinG), fiber_g: r1(t.fiberG), allergens: allergensOf(r.ingredients, cat.food), minutes: r.prepMin + r.cookMin };
      }),
      foods: cat.foods.map((f) => ({ food_id: f.id, name: f.name, state: f.state })),
      pantry: pantry.map((p) => ({ name: p.name, grams: Math.round(p.grams) })),
    };
  },
  async get_nutrition_summary({ days }: { days: number }) {
    const from = since(days);
    const logs = (await all("food_logs")).filter((l) => l.date >= from);
    const byDay = new Map<string, { kcal: number; p: number; c: number; f: number }>();
    logs.forEach((l) => {
      const d = byDay.get(l.date) ?? { kcal: 0, p: 0, c: 0, f: 0 };
      byDay.set(l.date, { kcal: d.kcal + l.totals.kcal, p: d.p + l.totals.proteinG, c: d.c + l.totals.carbsAvailableG, f: d.f + l.totals.fiberG });
    });
    const n = byDay.size;
    const avg = (k: "kcal" | "p" | "c" | "f") => (n ? Math.round([...byDay.values()].reduce((a, d) => a + d[k], 0) / n) : null);
    const cat = await loadCatalog();
    const meals = await weekMeals(weekStartOf(localDate()));
    return {
      period_days: days, days_with_logs: n, note: "Promedios solo de días con registros; son cálculos sobre valores de referencia.",
      avg_per_logged_day: { kcal: avg("kcal"), protein_g: avg("p"), carbs_available_g: avg("c"), fiber_g: avg("f") },
      this_week_menu: meals.map((m) => ({ date: m.date, slot: m.slot, recipe_id: m.recipeId, name: cat.recipe(m.recipeId)?.name, servings: m.servings, status: m.status, locked: m.locked })),
    };
  },
  async get_cgm_period_summary({ days }: { days: number }) {
    const d = await tbl("diabetes_settings").get("me");
    const p = await tbl("profiles").get("me");
    const last = await tbl("cgm_readings").orderBy("ts").reverse().filter((x) => active(x) && x.kind === "historic").first();
    if (!last) return { available: false, message: "No hay datos de glucosa importados." };
    const end = Date.parse(last.ts) + 60000;
    const start = end - days * 864e5;
    const rs = (await readingsBetween(start, end)).map((r) => ({ ms: Date.parse(r.ts), mgdl: r.valueMgdl, originalValue: r.originalValue, originalUnit: r.originalUnit }));
    const ranges = { veryLow: d?.veryLow ?? 54, low: d?.targetLow ?? 70, high: d?.targetHigh ?? 180, veryHigh: d?.veryHigh ?? 250 };
    const m = computeMetrics(rs, start, end, ranges, 15);
    const ex = (await all("endurance_sessions")).filter((e) => Date.parse(e.startedAt) >= start).map((e) => ({ id: e.id, label: e.sport, group: e.sport, start: Date.parse(e.startedAt), end: Date.parse(e.startedAt) + e.durationSec * 1000 }));
    return {
      available: true, unit_reported: "mg/dL (convierte a la unidad del usuario si la pide)", ranges_mgdl: ranges, ranges_source: d?.targetsSource,
      period: { start: new Date(start).toISOString(), end: new Date(end).toISOString(), days: r1(m.days), last_data_at: last.ts, coverage_pct: r1(m.coveragePct), readings: m.n, gaps_over_45min: m.gaps.length, sufficient_for_conclusions: m.sufficient },
      pct: { very_low: r1(m.pct.vlow), low: r1(m.pct.low), in_range: r1(m.pct.in), high: r1(m.pct.high), very_high: r1(m.pct.vhigh) },
      mean_mgdl: r1(m.mean), sd_mgdl: r1(m.sd), cv_pct: r1(m.cv), gmi_pct_estimate: m.gmi, gmi_note: m.gmiReason,
      episodes: DEFAULT_EPISODE_RULES.map((rule) => ({ rule: rule.label, count: detectEpisodes(rs, rule).length })),
      by_time_block: byTimeBlock(rs.map((r) => ({ ...r, minuteOfDay: minutesOfDay(r.ms, p?.timezone) })), ranges).map((b) => ({ block: b.label, pct_in: r1(b.pctIn), pct_below: r1(b.pctBelow70), pct_above: r1(b.pctAbove180) })),
      activity_observations: observations(summarizeGroups(activityGlucose(rs.sort((a, b) => a.ms - b.ms), ex))),
      reminder: "Datos retrospectivos; no son tiempo real. Describe, no prescribas.",
    };
  },
  async get_day_balance({ date }: { date: string | null }) {
    const cat = await loadCatalog();
    const b = await loadDayBalance(date ?? localDate(), cat);
    const range = (r: [number, number] | null) => (r ? [Math.round(r[0]), Number.isFinite(r[1]) ? Math.round(r[1]) : null] : null);
    return {
      date: b.date,
      targets: { kcal: range(b.targets.kcal), protein_g: range(b.targets.proteinG), fat_g: range(b.targets.fatG), carbs_available_g_prescribed: b.targets.carbsG, fiber_g_min: b.targets.fiberG },
      logged: b.logs.map((l) => ({ slot: l.slot, title: l.title, source: l.source, kcal: Math.round(l.totals.kcal), protein_g: r1(l.totals.proteinG), carbs_available_g: r1(l.totals.carbsAvailableG), fat_g: r1(l.totals.fatG) })),
      remaining_planned: b.remaining.map((m) => {
        const t = recipeNutrition(m.recipe.ingredients, cat.food, m.servings, m.recipe.servings).totals;
        return {
          meal_id: m.id, slot: m.slot, recipe_id: m.recipe.id, name: m.recipe.name, servings: m.servings,
          kcal: Math.round(t.kcal), protein_g: r1(t.proteinG), carbs_available_g: r1(t.carbsAvailableG), fat_g: r1(t.fatG),
          ingredients: portionLines(m.recipe.ingredients, cat.food, m.servings, m.recipe.servings).map((l) => ({ food_id: l.foodId, name: l.name, grams: Math.round(l.grams) })),
        };
      }),
      status: Object.fromEntries(b.nutrients.map((n) => [n.key, { consumed: r1(n.consumed), planned_rest: r1(n.planned), projected: r1(n.projected), status: n.status }])),
      app_messages: b.messages,
      rebalance_options: b.options.map((o) => ({ meal_id: o.mealId, slot: o.slot, recipe_id: o.recipe.id, name: o.recipe.name, servings: o.servings, why: o.why, carbs_change_g: Math.round(o.dCarbs), changes_carbs: o.carbsChanged })),
      includes_estimates: b.hasEstimates,
      rules: "No propongas saltarse comidas, ayunos ni compensar con ejercicio. Mantén los hidratos de cada comida salvo que el usuario lo pida; si cambian, indícalo y remite a su protocolo/equipo. Valores orientativos.",
    };
  },
  async get_recovery_summary({ days }: { days: number }) {
    const from = since(days);
    const checks = (await all("recovery_checkins")).filter((c) => c.date >= from);
    const notes = (await all("user_notes")).filter((n) => n.date >= from);
    const sleep = (await all("sleep_records")).filter((s) => s.date >= from);
    return {
      checkins: checks.map((c) => ({ date: c.date, sleep_h: c.sleepHours, sleep_quality_1_5: c.sleepQuality, energy: c.energy, fatigue: c.fatigue, soreness: c.soreness, stress: c.stress, pain: c.pain })),
      sleep_records: sleep.map((s) => ({ date: s.date, hours: r1(s.durationMin / 60) })),
      notes: notes.map((n) => ({ date: n.date, kind: n.kind, level: n.level, text: n.body.slice(0, 300) })),
    };
  },
};

async function writeTool(name: string, input: unknown): Promise<ToolOutcome> {
  if (name === "propose_schedule_changes") {
    const x = input as z.infer<typeof ProposeSchedule>;
    const ids = x.changes.map((c) => c.item_id);
    const items = (await tbl("planned_items").bulkGet(ids)).filter(active) as PlannedItem[];
    if (items.length !== ids.length) return { content: "Algún item_id no existe. Usa get_weekly_schedule para obtener ids válidos.", isError: true };
    if (items.some((i) => i.locked)) return { content: "Alguna sesión está bloqueada por el usuario y no se puede cambiar.", isError: true };
    const ws = items[0].weekStart;
    const week = (await tbl("planned_items").where("weekStart").equals(ws).toArray()).filter(active);
    const changed = week.map((w) => {
      const c = x.changes.find((y) => y.item_id === w.id);
      return c ? { ...w, date: c.date ?? w.date, intensity: c.intensity ?? w.intensity, durationMin: c.duration_min ?? w.durationMin, status: c.status ?? w.status } : w;
    });
    const errs = validateWeek(changed, { weekStart: ws }).filter((v) => v.severity === "error");
    if (errs.length) return { content: `La propuesta incumple reglas del planificador: ${errs.map((e) => e.message).join(" ")} Reformúlala.`, isError: true };
    const ops: ProposalOp[] = [];
    const inverse: ProposalOp[] = [];
    for (const c of x.changes) {
      const it = items.find((i) => i.id === c.item_id)!;
      const ch: Record<string, unknown> = {};
      if (c.date) ch.date = c.date;
      if (c.intensity) ch.intensity = c.intensity;
      if (c.duration_min) ch.durationMin = c.duration_min;
      if (c.notes) ch.notes = c.notes;
      ch.status = c.status ?? "modified";
      if (c.date && c.date !== it.date) ch.originalDate = it.originalDate ?? it.date;
      ops.push({ op: "update", table: "planned_items", id: it.id, changes: ch });
      inverse.push({ op: "update", table: "planned_items", id: it.id, changes: Object.fromEntries(Object.keys(ch).map((k) => [k, (it as unknown as Record<string, unknown>)[k] ?? null])) });
    }
    const r = await createProposal({ domain: "plan", kind: "ai_schedule", title: x.title, summary: x.summary, reasons: x.reasons, ...metaToProposal(x.meta), ops, inverse, origin: "ai", requiresApproval: true, expiresAt: null });
    return "error" in r ? { content: r.error, isError: true } : { content: `Propuesta creada (pendiente de aprobación del usuario, id ${r.id}).` };
  }
  if (name === "draft_training_plan") {
    const x = input as z.infer<typeof TrainingPlanDraft>;
    const bad = x.days.flatMap((d) => d.items).filter((i) => !findExercise(i.exercise_id)).map((i) => i.exercise_id);
    if (bad.length) return { content: `exercise_id inexistentes: ${bad.join(", ")}. Ids válidos: ${LIBRARY.map((e) => e.id).join(", ")}`, isError: true };
    const record = {
      name: x.name, kind: "custom", source: "ai_draft", description: x.description,
      days: x.days.map((d) => ({ title: d.title, subtitle: d.subtitle, focus: d.focus, items: d.items.map((i) => ({ exerciseId: i.exercise_id, sets: i.sets, repsMin: Math.min(i.reps_min, i.reps_max), repsMax: Math.max(i.reps_min, i.reps_max), rir: i.rir, restSec: i.rest_sec, tempo: null, notes: i.notes, repsLabel: null })) })),
    };
    const r = await createProposal({ domain: "training", kind: "ai_training_plan", title: `Nueva rutina: ${x.name}`, summary: x.description, reasons: [x.description], ...metaToProposal(x.meta), ops: [{ op: "create", table: "workout_templates", record }], inverse: [], origin: "ai", requiresApproval: true, expiresAt: null });
    return "error" in r ? { content: r.error, isError: true } : { content: "Borrador de rutina creado; el usuario debe aceptarlo." };
  }
  if (name === "draft_meal_plan") {
    const x = input as z.infer<typeof MealPlanDraft>;
    const cat = await loadCatalog();
    const pr = await tbl("preferences").get("me");
    const excluded = [...(pr?.allergies ?? []), ...(pr?.intolerances ?? [])];
    const ops: ProposalOp[] = [];
    const inverse: ProposalOp[] = [];
    for (const c of x.changes) {
      const rec = cat.recipe(c.recipe_id);
      if (!rec) return { content: `recipe_id inexistente: ${c.recipe_id}`, isError: true };
      if (allergensOf(rec.ingredients, cat.food).some((a) => excluded.includes(a))) return { content: `${rec.name} contiene alérgenos excluidos por el usuario.`, isError: true };
      const entries = await weekMeals(weekStartOf(c.date));
      const e = entries.find((m) => m.date === c.date && m.slot === c.slot);
      if (!e) return { content: `No hay comida prevista el ${c.date} (${c.slot}). Consulta get_nutrition_summary.`, isError: true };
      if (e.locked || e.status === "eaten") return { content: `La comida del ${c.date} (${c.slot}) está bloqueada o ya hecha.`, isError: true };
      ops.push({ op: "update", table: "meal_entries", id: e.id, changes: { recipeId: rec.id, servings: c.servings, replacedFrom: e.recipeId, status: "planned" } });
      inverse.push({ op: "update", table: "meal_entries", id: e.id, changes: { recipeId: e.recipeId, servings: e.servings, replacedFrom: e.replacedFrom ?? null, status: e.status } });
    }
    const r = await createProposal({ domain: "nutrition", kind: "ai_meal_plan", title: x.title, summary: x.summary, reasons: [x.summary], ...metaToProposal(x.meta), ops, inverse, origin: "ai", requiresApproval: true, expiresAt: null });
    return "error" in r ? { content: r.error, isError: true } : { content: "Propuesta de menú creada (la lista de la compra se recalculará al aceptarla)." };
  }
  if (name === "draft_recipe") {
    const x = input as z.infer<typeof RecipeDraft>;
    const cat = await loadCatalog();
    const bad = x.ingredients.filter((i) => !cat.food(i.food_id)).map((i) => i.food_id);
    if (bad.length) return { content: `food_id inexistentes: ${bad.join(", ")}. Usa get_food_inventory.`, isError: true };
    const rid = crypto.randomUUID();
    const t = recipeNutrition(x.ingredients.map((i) => ({ foodId: i.food_id, grams: i.grams, note: null })), cat.food, 1, x.servings).totals;
    const ops: ProposalOp[] = [
      { op: "create", table: "recipes", record: { id: rid, name: x.name, slots: x.slots, servings: x.servings, prepMin: x.prep_min, cookMin: 0, difficulty: 1, steps: x.steps, tags: ["ia"], batchFriendly: x.servings > 1, costLevel: 2, source: "ai_draft" } },
      ...x.ingredients.map((i, k): ProposalOp => ({ op: "create", table: "recipe_ingredients", record: { recipeId: rid, foodId: i.food_id, grams: i.grams, note: null, sortOrder: k } })),
    ];
    const r = await createProposal({ domain: "nutrition", kind: "ai_recipe", title: `Nueva receta: ${x.name}`, summary: `Por ración (calculado por la app): ${Math.round(t.kcal)} kcal · ${Math.round(t.carbsAvailableG)} g hidratos disponibles · ${Math.round(t.proteinG)} g proteína.`, reasons: [], ...metaToProposal(x.meta), ops, inverse: [], origin: "ai", requiresApproval: true, expiresAt: null });
    return "error" in r ? { content: r.error, isError: true } : { content: `Receta propuesta. Valores calculados por la app por ración: ${Math.round(t.kcal)} kcal, ${Math.round(t.carbsAvailableG)} g hidratos disponibles.` };
  }
  if (name === "log_meal_estimate") {
    const x = input as z.infer<typeof LogMealEstimate>;
    const cat = await loadCatalog();
    const date = x.date ?? localDate();
    if (date > localDate()) return { content: "Solo se registran comidas ya hechas (hoy o días anteriores).", isError: true };
    let totals: NutrientTotals = EMPTY_TOTALS();
    const items: { foodId: string; grams: number }[] = [];
    const lines: string[] = [];
    let estimated = false;
    for (const it of x.items) {
      const food = it.food_id ? cat.food(it.food_id) : undefined;
      if (it.food_id && !food) return { content: `food_id inexistente: ${it.food_id}. Usa get_food_inventory o pasa food_id null con estimate.`, isError: true };
      if (food) {
        totals = addTotals(totals, nutrientsFor(food, it.grams));
        items.push({ foodId: food.id, grams: Math.round(it.grams) });
        lines.push(`${it.description}: ${Math.round(it.grams)} g (${food.name}, calculado)`);
        continue;
      }
      const e = it.estimate;
      if (!e) return { content: `«${it.description}» no está en la base: pasa estimate con valores aproximados para ${it.grams} g.`, isError: true };
      const fromMacros = 4 * e.protein_g + 4 * e.carbs_available_g + 9 * e.fat_g;
      if (Math.abs(fromMacros - e.kcal) > Math.max(40, e.kcal * 0.35)) return { content: `Estimación incoherente para «${it.description}»: ${e.kcal} kcal frente a ~${Math.round(fromMacros)} kcal por macronutrientes. Corrígela.`, isError: true };
      if ((e.kcal / it.grams) * 100 > 900 || e.protein_g + e.carbs_available_g + e.fat_g > it.grams * 1.05) return { content: `Estimación imposible para ${it.grams} g de «${it.description}». Corrígela.`, isError: true };
      estimated = true;
      totals = addTotals(totals, { ...EMPTY_TOTALS(), kcal: e.kcal, proteinG: e.protein_g, carbsAvailableG: e.carbs_available_g, fatG: e.fat_g, fiberG: e.fiber_g ?? 0, missing: ["satFatG", "sugarsG", "saltG", ...(e.fiber_g == null ? ["fiberG"] : [])] });
      lines.push(`${it.description}: ${Math.round(it.grams)} g (ESTIMADO: ${Math.round(e.kcal)} kcal, ${Math.round(e.carbs_available_g)} g hidratos, ${Math.round(e.fat_g)} g grasa)`);
    }
    const [hh, mm] = (x.time_hhmm ?? "").split(":").map(Number);
    const eatenAt = x.time_hhmm ? new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`).toISOString() : date === localDate() ? new Date().toISOString() : new Date(`${date}T13:00:00`).toISOString();
    const ops: ProposalOp[] = [{
      op: "create", table: "food_logs",
      record: { date, eatenAt, slot: x.slot, mealEntryId: null, recipeId: null, servings: null, items, title: x.title, totals, source: estimated ? "estimated" : "calculated", note: estimated ? `Incluye valores estimados por el asistente: ${lines.filter((l) => l.includes("ESTIMADO")).join("; ").slice(0, 400)}` : null },
    }];
    const inverse: ProposalOp[] = [];
    if (x.replaces_planned_meal) {
      const e = (await tbl("meal_entries").where("date").equals(date).toArray()).filter(active).find((m) => m.slot === x.slot && m.status === "planned");
      if (e) {
        ops.push({ op: "update", table: "meal_entries", id: e.id, changes: { status: "replaced" } });
        inverse.push({ op: "update", table: "meal_entries", id: e.id, changes: { status: "planned" } });
      }
    }
    // Cómo queda el día con este registro (determinista)
    const b = await loadDayBalance(date, cat);
    const remaining = b.remaining.filter((m) => !(m.slot === x.slot && x.replaces_planned_meal));
    const after = dayBalance([...b.logs.map((l) => l.totals), totals], remaining, cat.food, b.targets);
    const fat = after.nutrients.find((n) => n.key === "fatG")!;
    const kcal = after.nutrients.find((n) => n.key === "kcal")!;
    const summary = `${Math.round(totals.kcal)} kcal · ${Math.round(totals.carbsAvailableG)} g hidratos disp. · ${Math.round(totals.proteinG)} g proteína · ${Math.round(totals.fatG)} g grasa${estimated ? " (incluye estimaciones)" : ""}. Previsión del día: ${Math.round(kcal.projected)} kcal, ${Math.round(fat.projected)} g grasa.`;
    const warnings = [...x.meta.warnings, ...(estimated ? ["Valores estimados sin etiqueta: pueden desviarse bastante. No los uses como base para decisiones de insulina."] : [])];
    const r = await createProposal({ domain: "nutrition", kind: "ai_food_log", title: `Registrar: ${x.title}`, summary, reasons: lines.slice(0, 6), assumptions: x.meta.assumptions, dataUsed: x.meta.data_used, warnings, confidence: estimated ? "low" : x.meta.confidence, ops, inverse, origin: "ai", requiresApproval: true, expiresAt: null });
    return "error" in r ? { content: r.error, isError: true } : { content: `Registro propuesto (pendiente de aprobación). Calculado por la app: ${summary} Mensajes de la app: ${after.messages.join(" ")}` };
  }
  if (name === "propose_meal_variant") {
    const x = input as z.infer<typeof MealVariant>;
    const cat = await loadCatalog();
    const bad = x.ingredients.filter((i) => !cat.food(i.food_id)).map((i) => i.food_id);
    if (bad.length) return { content: `food_id inexistentes: ${bad.join(", ")}. Usa get_food_inventory.`, isError: true };
    const pr = await tbl("preferences").get("me");
    const excluded = [...(pr?.allergies ?? []), ...(pr?.intolerances ?? [])];
    const ings = x.ingredients.map((i) => ({ foodId: i.food_id, grams: i.grams, note: null }));
    if (allergensOf(ings, cat.food).some((a) => excluded.includes(a))) return { content: "La variante contiene alérgenos o intolerancias excluidos por el usuario.", isError: true };
    const e = (await tbl("meal_entries").where("date").equals(x.date).toArray()).filter(active).find((m) => m.slot === x.slot);
    if (!e) return { content: `No hay comida prevista el ${x.date} (${x.slot}). Usa get_day_balance.`, isError: true };
    if (e.locked || e.status === "eaten") return { content: "Esa comida está bloqueada o ya hecha.", isError: true };
    const orig = cat.recipe(e.recipeId);
    const before = orig ? recipeNutrition(orig.ingredients, cat.food, e.servings, orig.servings).totals : EMPTY_TOTALS();
    const t = recipeNutrition(ings, cat.food, 1, 1).totals;
    const dCarbs = t.carbsAvailableG - before.carbsAvailableG;
    const rid = crypto.randomUUID();
    const warnings = [...x.meta.warnings];
    if (Math.abs(dCarbs) > 10) warnings.push(`Esta variante cambia los hidratos de la comida en ${dCarbs > 0 ? "+" : ""}${Math.round(dCarbs)} g. Si sigues una pauta de hidratos o de insulina, revísalo con tu protocolo y tu equipo sanitario.`);
    const ops: ProposalOp[] = [
      { op: "create", table: "recipes", record: { id: rid, name: x.name, slots: [x.slot], servings: 1, prepMin: orig?.prepMin ?? 10, cookMin: orig?.cookMin ?? 0, difficulty: 1, steps: orig?.steps ?? [], tags: ["ia", "variante"], batchFriendly: false, costLevel: 2, source: "ai_draft" } },
      ...ings.map((i, k): ProposalOp => ({ op: "create", table: "recipe_ingredients", record: { recipeId: rid, foodId: i.foodId, grams: i.grams, note: null, sortOrder: k } })),
      { op: "update", table: "meal_entries", id: e.id, changes: { recipeId: rid, servings: 1, replacedFrom: e.recipeId, status: "planned" } },
    ];
    const inverse: ProposalOp[] = [{ op: "update", table: "meal_entries", id: e.id, changes: { recipeId: e.recipeId, servings: e.servings, replacedFrom: e.replacedFrom ?? null, status: e.status } }];
    const summary = `Calculado por la app: ${Math.round(t.kcal)} kcal · ${Math.round(t.carbsAvailableG)} g hidratos disp. (${dCarbs >= 0 ? "+" : ""}${Math.round(dCarbs)} g) · ${Math.round(t.proteinG)} g proteína · ${Math.round(t.fatG)} g grasa (${t.fatG - before.fatG >= 0 ? "+" : ""}${Math.round(t.fatG - before.fatG)} g).`;
    const r = await createProposal({ domain: "nutrition", kind: "ai_meal_variant", title: `Variante: ${x.name}`, summary, reasons: [x.reason], ...metaToProposal({ ...x.meta, warnings }), ops, inverse, origin: "ai", requiresApproval: true, expiresAt: null });
    return "error" in r ? { content: r.error, isError: true } : { content: `Variante propuesta (pendiente de aprobación). ${summary}${Math.abs(dCarbs) > 10 ? " AVISO: cambia los hidratos de la comida; dilo claramente al usuario." : ""}` };
  }
  if (name === "save_user_note") {
    const x = input as z.infer<typeof SaveNote>;
    const now = new Date().toISOString();
    const r = await createProposal({ domain: "habits", kind: "ai_note", title: "Guardar nota", summary: x.text.slice(0, 200), reasons: [], dataUsed: [], assumptions: [], warnings: [], confidence: "high", ops: [{ op: "create", table: "user_notes", record: { ts: now, date: localDate(), kind: x.kind, level: null, body: x.text } }], inverse: [], origin: "ai", requiresApproval: true, expiresAt: null });
    return "error" in r ? { content: r.error, isError: true } : { content: "Nota propuesta; el usuario debe confirmarla." };
  }
  return { content: "Herramienta de escritura desconocida.", isError: true };
}

export async function executeTool(call: ToolCall): Promise<ToolOutcome> {
  const def = TOOL_BY_NAME[call.name];
  if (!def) return { content: `Herramienta desconocida: ${call.name}`, isError: true };
  if (call.blocked) return { content: "Bloqueado por los guardarraíles clínicos: no se permiten indicaciones sobre insulina ni valoraciones clínicas.", isError: true };
  if (call.invalid) return { content: `Argumentos no válidos: ${call.invalid}`, isError: true };
  const v = validateToolInput(call.name, call.input);
  if (!v.ok) return { content: `Argumentos no válidos: ${v.error}`, isError: true };
  if (!scanDeep(v.data).ok) return { content: "Bloqueado por los guardarraíles clínicos.", isError: true };
  if (!(await consented(def.consent))) return { content: `El usuario no ha autorizado la categoría "${def.consent}". Explícale qué datos harían falta y que puede activarlo en Ajustes → Privacidad.`, isError: true };
  try {
    if (def.kind === "display") return { content: "Resumen mostrado al usuario.", display: v.data };
    if (def.kind === "write") return await writeTool(call.name, v.data);
    const out = await READ[call.name](v.data as never);
    return { content: JSON.stringify(out).slice(0, 50_000) };
  } catch (e) {
    return { content: `Error ejecutando la herramienta: ${e instanceof Error ? e.message : "desconocido"}`, isError: true };
  }
}
