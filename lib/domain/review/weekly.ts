/**
 * Revisión semanal determinista: métricas + 3 logros + 2 oportunidades + 1 experimento (hábito NO clínico).
 * Sin juicios sobre fluctuaciones diarias de peso; sin logros basados en glucosa (no gamificar).
 */
export const REVIEW_VERSION = "review-1.0";

export interface WeekData {
  weekStart: string;
  planned: number;
  done: number;
  missed: number;
  strengthSessions: number;
  runKm: number;
  bikeMin: number;
  walkMin: number;
  newBests: string[];
  weightDays: number;
  trendDeltaKg: number | null;
  proteinAvgG: number | null;
  proteinLowG: number | null;
  fiberAvgG: number | null;
  carbsAvgG: number | null;
  mealsLoggedDays: number;
  sleepAvgH: number | null;
  fatigueAvg: number | null;
  hardConsecutive: boolean;
  loadJumpPct: number | null;
  cgm: { tir: number; tbr: number; tar: number; cv: number | null; coverage: number; days: number } | null;
  stepsAvg: number | null;
}

export interface ReviewOutput {
  achievements: string[];
  opportunities: string[];
  experiment: { title: string; description: string } | null;
  notes: string[];
}

const EXPERIMENTS: Record<string, { title: string; description: string }> = {
  missed: { title: "Dejar preparado el material la noche antes", description: "Antes de cada día de entrenamiento, deja la ropa y la bolsa listas. Anota si te ayudó a cumplir." },
  fiber: { title: "Una ración extra de verdura en la cena", description: "Añade ~150 g de verdura a 4 cenas esta semana y anota la saciedad." },
  protein: { title: "Proteína en el desayuno", description: "Incluye una fuente de proteína (yogur griego, huevos, cottage) en 4 desayunos." },
  sleep: { title: "Acostarse 30 minutos antes", description: "Durante 4 noches, adelanta la hora de ir a la cama 30 min. Anota cómo te encuentras al día siguiente." },
  logging: { title: "Registrar la comida principal", description: "Marca como hecha (o sustituida) la comida principal cada día; sin contar calorías." },
  steps: { title: "Pausas activas en cinta", description: "En días de teletrabajo, 2 bloques de 15 min de caminata suave en cinta." },
  postmeal: { title: "Paseo corto tras una comida", description: "Camina 10 minutos después de la comida o la cena 4 días y anota cómo te sienta (hábito, no tratamiento)." },
  prep: { title: "Preparar desayunos el domingo", description: "Deja listos 3 desayunos (p. ej. avena con yogur) para los días con prisa." },
};

export function buildReview(d: WeekData): ReviewOutput {
  const ach: string[] = [];
  const opp: { key: string; text: string }[] = [];
  const notes: string[] = [];
  if (d.planned && d.done) ach.push(`Completaste ${d.done} de ${d.planned} sesiones previstas.`);
  if (d.newBests.length) ach.push(`Nuevo mejor 1RM estimado en ${d.newBests.slice(0, 2).join(" y ")} (estimación).`);
  if (d.runKm >= 1) ach.push(`Corriste ${d.runKm.toLocaleString("es-ES", { maximumFractionDigits: 1 })} km.`);
  if (d.bikeMin >= 30) ach.push(`Sumaste ${Math.round(d.bikeMin)} min de bici.`);
  if (d.fiberAvgG != null && d.fiberAvgG >= 25) ach.push(`Fibra media de ${Math.round(d.fiberAvgG)} g/día.`);
  if (d.proteinAvgG != null && d.proteinLowG != null && d.proteinAvgG >= d.proteinLowG) ach.push(`Proteína media dentro del rango (${Math.round(d.proteinAvgG)} g/día).`);
  if (d.sleepAvgH != null && d.sleepAvgH >= 7) ach.push(`Dormiste ${d.sleepAvgH.toLocaleString("es-ES", { maximumFractionDigits: 1 })} h de media.`);
  if (d.weightDays >= 3) ach.push(`Registraste el peso ${d.weightDays} días (la tendencia importa más que cada día).`);
  if (d.mealsLoggedDays >= 5) ach.push(`Registraste comidas ${d.mealsLoggedDays} días.`);
  if (d.walkMin >= 60) ach.push(`${Math.round(d.walkMin)} min de caminata/cinta.`);

  if (d.missed >= 2) opp.push({ key: "missed", text: `${d.missed} sesiones no realizadas: quizá un plan con una sesión menos sea más fácil de cumplir.` });
  if (d.hardConsecutive) opp.push({ key: "missed", text: "Hubo días duros seguidos; intenta separarlos con un día fácil." });
  if (d.loadJumpPct != null && d.loadJumpPct > 30) opp.push({ key: "sleep", text: `La carga subió un ${Math.round(d.loadJumpPct)} % respecto a tu media: vigila la recuperación.` });
  if (d.fiberAvgG != null && d.fiberAvgG < 20) opp.push({ key: "fiber", text: `Fibra media de ${Math.round(d.fiberAvgG)} g/día (referencia ≥ 25 g).` });
  if (d.proteinAvgG != null && d.proteinLowG != null && d.proteinAvgG < d.proteinLowG * 0.85) opp.push({ key: "protein", text: `Proteína media de ${Math.round(d.proteinAvgG)} g/día, por debajo del rango orientativo.` });
  if (d.sleepAvgH != null && d.sleepAvgH < 6.5) opp.push({ key: "sleep", text: `Sueño medio de ${d.sleepAvgH.toLocaleString("es-ES", { maximumFractionDigits: 1 })} h.` });
  if (d.mealsLoggedDays < 3) opp.push({ key: "logging", text: "Pocos días con comidas registradas: los resúmenes de nutrición son poco fiables." });
  if (d.stepsAvg != null && d.stepsAvg < 6000) opp.push({ key: "steps", text: `Media de ${Math.round(d.stepsAvg)} pasos/día.` });
  if (d.cgm && d.cgm.coverage < 70) opp.push({ key: "logging", text: `Datos de glucosa con cobertura del ${Math.round(d.cgm.coverage)} %: las métricas de la semana son poco representativas.` });

  const fallback = ["Has mantenido el registro de la app esta semana.", "Cada semana registrada mejora la calidad de las revisiones."];
  const achievements = ach.slice(0, 3);
  if (achievements.length < 3 && (d.done || d.weightDays || d.mealsLoggedDays)) achievements.push(...fallback.slice(0, 3 - achievements.length));
  const opportunities = opp.slice(0, 2).map((o) => o.text);
  const expKey = opp[0]?.key ?? (d.carbsAvgG != null ? "postmeal" : "prep");
  if (achievements.length < 3) notes.push("Pocos datos esta semana: la revisión es parcial.");
  return { achievements, opportunities, experiment: EXPERIMENTS[expKey] ?? EXPERIMENTS.prep, notes };
}
