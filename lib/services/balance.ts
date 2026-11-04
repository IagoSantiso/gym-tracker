/** Balance del día (lo comido + lo que queda del menú) y opciones para reajustar el resto. */
import { tbl } from "@/lib/db/db";
import { active, all } from "@/lib/db/repo";
import { dayBalance, rebalanceOptions, type DayBalance, type DayTargets, type RebalanceOption, type RemainingMeal } from "@/lib/domain/nutrition/balance";
import { eligibleRecipes } from "@/lib/domain/nutrition/menu";
import { localDate } from "@/lib/domain/time";
import type { FoodLog } from "@/lib/db/types";
import { loadCatalog, type Catalog } from "./nutrition";
import { compensationOption, energyDay, enduranceKcal, sessionSteps, strengthKcal, type CompensationOption, type EnergyDay } from "@/lib/domain/nutrition/energy";
import { SPORT_LABEL } from "@/lib/domain/training/endurance";
import { currentTargets } from "./targets";

export interface DayBalanceView extends DayBalance {
  date: string;
  logs: FoodLog[];
  remaining: RemainingMeal[];
  targets: DayTargets;
  options: RebalanceOption[];
  energy: EnergyDay;
  compensation: CompensationOption | null;
  exerciseToday: { label: string; kcal: number }[];
}

export async function loadDayBalance(date = localDate(), cat?: Catalog): Promise<DayBalanceView> {
  const c = cat ?? (await loadCatalog());
  const [logs, entries, ct, prefs] = await Promise.all([
    tbl("food_logs").where("date").equals(date).toArray().then((l) => l.filter(active)),
    tbl("meal_entries").where("date").equals(date).toArray().then((l) => l.filter(active)),
    currentTargets(),
    tbl("preferences").get("me"),
  ]);
  const loggedSlots = new Set(logs.map((l) => l.slot));
  const remaining: RemainingMeal[] = entries
    .filter((e) => e.status === "planned" && !loggedSlots.has(e.slot))
    .flatMap((e) => {
      const recipe = c.recipe(e.recipeId);
      return recipe ? [{ id: e.id, slot: e.slot, recipe, servings: e.servings }] : [];
    });
  const targets: DayTargets = { kcal: ct.kcal, proteinG: ct.proteinG, fatG: ct.fatG, carbsG: ct.carbsG, fiberG: ct.fiberG };
  const totals = logs.map((l) => l.totals);
  const hasEstimates = logs.some((l) => l.source === "estimated" || l.source === "ai_draft");
  const b = dayBalance(totals, remaining, c.food, targets, { hasEstimates });
  const rp = await all("recipe_prefs");
  const pool = eligibleRecipes(c.recipes, c.food, {
    excludedAllergens: [...(prefs?.allergies ?? []), ...(prefs?.intolerances ?? [])],
    excludedFoods: [...(prefs?.excludedFoods ?? []), ...(prefs?.foodContext?.avoid ?? [])],
    blacklist: rp.filter(p => p.blacklisted || p.frequency === "never").map(p => p.recipeId),
  });
  const options = logs.length ? rebalanceOptions(totals, remaining, pool, c.food, targets) : [];

  // Energía: consumido vs gastado estimado
  const kg = ct.latestWeight;
  const [end, str, act, planned, diab] = await Promise.all([
    tbl("endurance_sessions").where("date").equals(date).toArray().then((l) => l.filter(active)),
    tbl("workout_sessions").where("date").equals(date).toArray().then((l) => l.filter((w) => active(w) && w.status === "completed")),
    tbl("daily_activity").where("date").equals(date).toArray().then((l) => l.filter(active)),
    tbl("planned_items").where("date").equals(date).toArray().then((l) => l.filter(active)),
    tbl("diabetes_settings").get("me"),
  ]);
  const exerciseToday = kg ? [
    ...end.map((e) => ({ label: `${SPORT_LABEL[e.sport]} ${Math.round(e.durationSec / 60)} min`, kcal: Math.round(enduranceKcal(e, kg)) })),
    ...str.map((w) => ({ label: `${w.title}${w.durationMin ? ` ${w.durationMin} min` : " · duración sin registrar"}`, kcal: Math.round(strengthKcal(w.durationMin ?? 0, kg)) })),
  ] : [];
  const bmr = ct.estimate?.ok && ct.estimate.bmr ? (ct.estimate.bmr[0] + ct.estimate.bmr[1]) / 2 : null;
  const tdeeMid = ct.estimate?.ok && ct.estimate.tdee ? (ct.estimate.tdee[0] + ct.estimate.tdee[1]) / 2 : null;
  const targetDeficit = ct.mode === "manual" && ct.kcal && tdeeMid ? Math.max(0, tdeeMid - ct.kcal[0]) : ct.estimate?.deficitKcal ?? 0;
  const energy = energyDay({
        // pasos del día sin los de las sesiones a pie ya contadas como ejercicio (evita doble conteo)
    weightKg: kg, bmrMid: bmr, steps: Math.max(0, Math.max(0, ...act.map((a) => a.steps ?? 0)) - end.reduce((a, e) => a + sessionSteps(e), 0)) || null, exercise: exerciseToday,
    intakeKcal: b.consumed.kcal, plannedRestKcal: b.plannedRest.kcal, targetDeficit,
    dayClosed: date < localDate() || (remaining.length === 0 && new Date().getHours() >= 21),
  });
  const compensation = energy.ok && energy.verdict === "over" && kg ? compensationOption({
    excess: energy.excess, weightKg: kg, maxPct: prefs?.compensationMaxPct ?? 30,
    hardSessionToday: planned.some((p) => p.intensity === "hard" && p.status !== "cancelled") || end.some((e) => (e.rpe ?? 0) >= 8),
    exerciseMinToday: end.reduce((a, e) => a + e.durationSec / 60, 0) + str.reduce((a, w) => a + (w.durationMin ?? 0), 0),
    hasDiabetes: !!diab?.enabled && diab.diabetesType === "type1",
  }) : null;
  return { ...b, date, logs, remaining, targets, options, energy, compensation, exerciseToday };
}

/** Añade al plan de hoy la actividad suave de compensación elegida (el usuario la ha pedido). */
export async function addCompensationToPlan(date: string, a: { label: string; minutes: number; speedKmh: number; inclinePct: number }, kcal: number) {
  const { put } = await import("@/lib/db/repo");
  const { weekStartOf } = await import("@/lib/domain/time");
  const isWalk = a.speedKmh < 7;
  return put("planned_items", {
    date, weekStart: weekStartOf(date), kind: isWalk ? "walk" : "run", title: `${a.label} · compensación`,
    intensity: "easy", durationMin: a.minutes, sortOrder: 90, status: "planned", locked: false, source: "calculated",
    notes: `Cinta ${a.speedKmh.toLocaleString("es-ES")} km/h, inclinación ${a.inclinePct} %. ~${kcal} kcal estimadas. Suave: deberías poder hablar.`,
  });
}
