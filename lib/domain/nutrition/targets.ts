/**
 * Objetivos energéticos ESTIMADOS con rango y supuestos explícitos.
 * - BMR: Mifflin-St Jeor (1990). Error típico ±10 % a nivel individual.
 * - Gasto total = BMR × factor de actividad (rango).
 * - Déficit: ritmo elegido (%/semana) × peso × ~7700 kcal/kg ÷ 7, con límites prudentes:
 *   ≤ 25 % del gasto y nunca por debajo del BMR estimado. Ritmo máximo 1 %/semana.
 * - Proteína 1,6–2,2 g/kg con entrenamiento de fuerza (rango); fibra ≥ 25 g (EFSA).
 * - Hidratos: la app NO prescribe un objetivo glucémico; muestra el reparto y, si existe, el plan acordado.
 */
import type { Goals, Profile } from "@/lib/db/types";

export interface EnergyEstimate {
  ok: boolean;
  missing: string[];
  bmr?: [number, number];
  tdee?: [number, number];
  target?: [number, number];
  deficitKcal?: number;
  proteinG?: [number, number];
  fiberG: number;
  activityFactor?: [number, number];
  formula: string;
  assumptions: string[];
  warnings: string[];
}

export function ageFrom(birthDate: string | null | undefined, today: string): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

export function mifflin(weightKg: number, heightCm: number, age: number, sex: "female" | "male"): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

/** Factor de actividad a partir de minutos semanales de ejercicio y pasos medios. */
export function activityFactor(weeklyExerciseMin: number, avgSteps: number | null): [number, number] {
  let f = 1.2;
  if (weeklyExerciseMin >= 60) f = 1.375;
  if (weeklyExerciseMin >= 150) f = 1.45;
  if (weeklyExerciseMin >= 270) f = 1.55;
  if (weeklyExerciseMin >= 420) f = 1.65;
  if (avgSteps != null && avgSteps >= 10000) f += 0.05;
  return [Math.round((f - 0.05) * 100) / 100, Math.round((f + 0.05) * 100) / 100];
}

export function estimateEnergy(
  p: Pick<Profile, "birthDate" | "sex" | "heightCm">,
  g: Pick<Goals, "primaryGoal" | "weightLossRatePct" | "calorieMode" | "manualKcal">,
  weightKg: number | null,
  today: string,
  activity: { weeklyExerciseMin: number; avgSteps: number | null },
): EnergyEstimate {
  const missing: string[] = [];
  const age = ageFrom(p.birthDate, today);
  if (!weightKg) missing.push("peso");
  if (!p.heightCm) missing.push("altura");
  if (age == null) missing.push("fecha de nacimiento");
  const base: EnergyEstimate = {
    ok: false, missing, fiberG: 25, formula: "Mifflin-St Jeor × factor de actividad",
    assumptions: [], warnings: [],
  };
  if (missing.length) return base;
  const sexes: ("female" | "male")[] = p.sex ? [p.sex] : ["female", "male"];
  const bmrs = sexes.map((s) => mifflin(weightKg!, p.heightCm!, age!, s));
  const bmr: [number, number] = [Math.min(...bmrs) * 0.9, Math.max(...bmrs) * 1.1];
  const af = activityFactor(activity.weeklyExerciseMin, activity.avgSteps);
  const tdee: [number, number] = [bmr[0] * af[0], bmr[1] * af[1]];
  const assumptions = [
    `Edad ${age} años, ${weightKg} kg, ${p.heightCm} cm${p.sex ? "" : " (sin sexo: rango que abarca ambas ecuaciones)"}.`,
    `Actividad: ${Math.round(activity.weeklyExerciseMin)} min/semana de ejercicio${activity.avgSteps ? `, ~${Math.round(activity.avgSteps)} pasos/día` : ""} → factor ${af[0]}–${af[1]}.`,
    "Margen ±10 % por error individual de la ecuación.",
  ];
  const warnings: string[] = [];
  let deficit = 0;
  if (g.primaryGoal === "fat_loss" || g.primaryGoal === "recomposition") {
    const rate = Math.min(1, Math.max(0, g.weightLossRatePct));
    if (g.weightLossRatePct > 1) warnings.push("Ritmo limitado a 1 %/semana por prudencia.");
    deficit = (rate / 100) * weightKg! * 7700 / 7;
    if (g.primaryGoal === "recomposition") deficit = Math.min(deficit, 250);
    const mid = (tdee[0] + tdee[1]) / 2;
    if (deficit > mid * 0.25) {
      deficit = mid * 0.25;
      warnings.push("Déficit limitado al 25 % del gasto estimado.");
    }
  }
  let target: [number, number] = [tdee[0] - deficit, tdee[1] - deficit];
  const floor = Math.min(...bmrs);
  if (target[0] < floor) {
    target = [floor, Math.max(floor, target[1])];
    warnings.push("El objetivo no baja del metabolismo basal estimado.");
  }
  const round10 = (n: number) => Math.round(n / 10) * 10;
  return {
    ...base,
    ok: true,
    bmr: [round10(bmr[0]), round10(bmr[1])],
    tdee: [round10(tdee[0]), round10(tdee[1])],
    target: [round10(target[0]), round10(target[1])],
    deficitKcal: Math.round(deficit),
    proteinG: [Math.round(weightKg! * 1.6), Math.round(weightKg! * 2.2)],
    activityFactor: af,
    assumptions,
    warnings: [...warnings, "Los relojes y estas fórmulas estiman el gasto con error; revisa la tendencia de peso de 3–4 semanas antes de cambiar nada."],
  };
}

/** Media móvil exponencial del peso (suaviza fluctuaciones diarias de agua/glucógeno). */
export function weightTrend(entries: { date: string; weightKg: number }[], alpha = 0.25): { date: string; weightKg: number; trend: number }[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let t: number | null = null;
  return sorted.map((e) => {
    t = t == null ? e.weightKg : t + alpha * (e.weightKg - t);
    return { ...e, trend: Math.round(t * 100) / 100 };
  });
}

/** Ritmo semanal de la tendencia (kg/semana) por regresión lineal de los últimos `days` días. */
export function weeklyRate(trend: { date: string; trend: number }[], days = 28): number | null {
  if (trend.length < 6) return null;
  const last = trend.at(-1)!.date;
  const toDay = (d: string) => Date.parse(d + "T00:00:00Z") / 864e5;
  const pts = trend.filter((p) => toDay(last) - toDay(p.date) <= days);
  if (pts.length < 6 || toDay(last) - toDay(pts[0].date) < 14) return null;
  const xs = pts.map((p) => toDay(p.date));
  const ys = pts.map((p) => p.trend);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return den ? Math.round((num / den) * 7 * 100) / 100 : null;
}
