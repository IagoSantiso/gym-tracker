/** Objetivo nutricional vigente: acordado (manual) o estimado con rango a partir de datos recientes. */
import { tbl } from "@/lib/db/db";
import { all } from "@/lib/db/repo";
import { fatRange } from "@/lib/domain/nutrition/balance";
import { estimateEnergy, weeklyRate, weightTrend, type EnergyEstimate } from "@/lib/domain/nutrition/targets";
import { addDays, localDate } from "@/lib/domain/time";

export interface CurrentTargets {
  mode: "manual" | "estimated";
  kcal: [number, number] | null;
  proteinG: [number, number] | null;
  carbsG: number | null;
  /** grasa: pauta manual o 25–35 % de la energía */
  fatG: [number, number] | null;
  fiberG: number;
  estimate: EnergyEstimate | null;
  latestWeight: number | null;
  ratePerWeek: number | null;
  trendDays: number;
  source: string;
}

export async function currentTargets(): Promise<CurrentTargets> {
  const today = localDate();
  const [profile, goals] = await Promise.all([tbl("profiles").get("me"), tbl("goals").get("me")]);
  const weights = (await all("weight_entries")).sort((a, b) => a.date.localeCompare(b.date));
  const trend = weightTrend(weights.map((w) => ({ date: w.date, weightKg: w.weightKg })));
  const latestWeight = trend.at(-1)?.trend ?? null;
  const from = addDays(today, -28);
  const end = (await all("endurance_sessions")).filter((s) => s.date >= from).reduce((a, s) => a + s.durationSec / 60, 0);
  const str = (await all("workout_sessions")).filter((s) => s.date >= from && s.status === "completed").reduce((a, s) => a + (s.durationMin ?? 60), 0);
  const steps = (await all("daily_activity")).filter((d) => d.date >= from && d.steps);
  const est = profile && goals ? estimateEnergy(profile, goals, latestWeight, today, { weeklyExerciseMin: (end + str) / 4, avgSteps: steps.length ? steps.reduce((a, d) => a + (d.steps ?? 0), 0) / steps.length : null }) : null;
  const trendDays = trend.length ? Math.round((Date.parse(today) - Date.parse(trend[0].date)) / 864e5) : 0;
  if (goals?.calorieMode === "manual" && goals.manualKcal) {
    return {
      mode: "manual", kcal: [goals.manualKcal, goals.manualKcal], proteinG: goals.manualProteinG ? [goals.manualProteinG, goals.manualProteinG] : est?.proteinG ?? null,
      carbsG: goals.manualCarbsG ?? null, fatG: fatRange([goals.manualKcal, goals.manualKcal], goals.manualFatG), fiberG: 25, estimate: est, latestWeight, ratePerWeek: weeklyRate(trend), trendDays,
      source: goals.manualSource ? `Acordado: ${goals.manualSource}` : "Acordado con profesional",
    };
  }
  return {
    mode: "estimated", kcal: est?.ok ? est.target! : null, proteinG: est?.proteinG ?? null, carbsG: null,
    fatG: fatRange(est?.ok ? est.target! : null, goals?.manualFatG), fiberG: 25, estimate: est,
    latestWeight, ratePerWeek: weeklyRate(trend), trendDays, source: "Estimación (Mifflin-St Jeor × actividad)",
  };
}
