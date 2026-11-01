/**
 * Métricas de resistencia y carga. Todas son APROXIMACIONES etiquetadas como tales.
 *  - Carga interna (sRPE, Foster): duración (min) × RPE (0–10).
 *  - ACWR (agudo 7 d / crónico 28 d): solo descriptivo; NO es predictor de lesión.
 *  - Zonas FC: % de FC máx (o % de LTHR si está configurado).
 */
import type { EnduranceSession, EnduranceType, RunSpec, WorkoutSession } from "@/lib/db/types";
import { addDays, daysBetween } from "@/lib/domain/time";

export const sessionLoad = (durationMin: number, rpe?: number | null) => (rpe == null ? null : Math.round(durationMin * rpe));

export interface DayLoad {
  date: string;
  load: number;
  hard: boolean;
  /** sesiones sin RPE (no suman carga) */
  unknown: number;
}

/** Carga diaria combinando fuerza y resistencia. */
export function dailyLoads(
  endurance: Pick<EnduranceSession, "date" | "durationSec" | "rpe">[],
  strength: Pick<WorkoutSession, "date" | "durationMin" | "rpe" | "status">[],
): Record<string, DayLoad> {
  const out: Record<string, DayLoad> = {};
  const add = (date: string, min: number, rpe?: number | null) => {
    const d = (out[date] ??= { date, load: 0, hard: false, unknown: 0 });
    const l = sessionLoad(min, rpe);
    if (l == null) d.unknown++;
    else d.load += l;
    if ((rpe ?? 0) >= 7) d.hard = true;
  };
  endurance.forEach((e) => add(e.date, e.durationSec / 60, e.rpe));
  strength.filter((s) => s.status === "completed").forEach((s) => add(s.date, s.durationMin ?? 60, s.rpe));
  return out;
}

export interface AcwrResult {
  acute: number;
  chronicWeekly: number;
  ratio: number | null;
  daysWithData: number;
  note: string;
}

/** Ratio agudo:crónico (media semanal de 28 d). Requiere ≥ 21 días de historial. */
export function acwr(loads: Record<string, DayLoad>, today: string): AcwrResult {
  const sum = (from: number, to: number) => {
    let s = 0;
    for (let i = from; i <= to; i++) s += loads[addDays(today, -i)]?.load ?? 0;
    return s;
  };
  const acute = sum(0, 6);
  const chronicWeekly = sum(0, 27) / 4;
  const dates = Object.keys(loads).filter((d) => daysBetween(d, today) >= 0 && daysBetween(d, today) < 28);
  const first = dates.sort()[0];
  const days = first ? daysBetween(first, today) + 1 : 0;
  const ratio = days >= 21 && chronicWeekly > 0 ? acute / chronicWeekly : null;
  return {
    acute, chronicWeekly: Math.round(chronicWeekly), ratio: ratio == null ? null : Math.round(ratio * 100) / 100, daysWithData: days,
    note:
      ratio == null
        ? "Historial insuficiente (< 3 semanas) para comparar carga aguda y crónica."
        : ratio > 1.5
          ? "La carga de esta semana es bastante mayor que tu media reciente. Es una aproximación, no un predictor: valora cómo te encuentras."
          : ratio < 0.8
            ? "Semana más ligera que tu media reciente."
            : "Carga en línea con tu media reciente.",
  };
}

/** Distribución de intensidad por RPE: fácil ≤ 4, moderado 5–6, duro ≥ 7 (minutos). */
export function intensityDistribution(sessions: Pick<EnduranceSession, "durationSec" | "rpe">[]) {
  const d = { easy: 0, moderate: 0, hard: 0, unknown: 0 };
  for (const s of sessions) {
    const m = s.durationSec / 60;
    if (s.rpe == null) d.unknown += m;
    else if (s.rpe <= 4) d.easy += m;
    else if (s.rpe <= 6) d.moderate += m;
    else d.hard += m;
  }
  return d;
}

export type HrZones = { name: string; lo: number; hi: number }[];

export function hrZones(cfg: { max?: number | null; lthr?: number | null } | null | undefined): HrZones | null {
  if (cfg?.lthr) {
    const l = cfg.lthr;
    return [
      { name: "Z1 recuperación", lo: 0, hi: Math.round(l * 0.85) },
      { name: "Z2 aeróbico", lo: Math.round(l * 0.85), hi: Math.round(l * 0.89) },
      { name: "Z3 tempo", lo: Math.round(l * 0.9), hi: Math.round(l * 0.94) },
      { name: "Z4 umbral", lo: Math.round(l * 0.95), hi: Math.round(l * 0.99) },
      { name: "Z5 VO2", lo: Math.round(l), hi: 250 },
    ];
  }
  if (cfg?.max) {
    const m = cfg.max;
    return [
      { name: "Z1", lo: Math.round(m * 0.5), hi: Math.round(m * 0.6) },
      { name: "Z2", lo: Math.round(m * 0.6), hi: Math.round(m * 0.7) },
      { name: "Z3", lo: Math.round(m * 0.7), hi: Math.round(m * 0.8) },
      { name: "Z4", lo: Math.round(m * 0.8), hi: Math.round(m * 0.9) },
      { name: "Z5", lo: Math.round(m * 0.9), hi: m },
    ];
  }
  return null;
}

/** Tiempo en zonas a partir de muestras (t en s, hr en ppm). */
export function timeInZones(points: { t: number; hr?: number }[], zones: HrZones): number[] {
  const out = zones.map(() => 0);
  for (let i = 1; i < points.length; i++) {
    const hr = points[i].hr;
    const dt = points[i].t - points[i - 1].t;
    if (hr == null || dt <= 0 || dt > 60) continue;
    const z = zones.findIndex((zz) => hr >= zz.lo && hr <= zz.hi);
    if (z >= 0) out[z] += dt;
  }
  return out;
}

/** Riegel: tiempo previsto para otra distancia (orientativo). */
export const riegel = (timeSec: number, fromKm: number, toKm: number) => timeSec * (toKm / fromKm) ** 1.06;

/** Ritmos orientativos (s/km) desde una marca reciente, como rangos. */
export function paceGuide(ref: { distanceKm: number; timeSec: number } | null | undefined) {
  if (!ref || !ref.distanceKm || !ref.timeSec) return null;
  const p5 = riegel(ref.timeSec, ref.distanceKm, 5) / 5;
  const p10 = riegel(ref.timeSec, ref.distanceKm, 10) / 10;
  const r = (a: number, b: number): [number, number] => [Math.round(a), Math.round(b)];
  return {
    recovery: r(p5 + 105, p5 + 135),
    easy: r(p5 + 75, p5 + 105),
    long: r(p5 + 70, p5 + 100),
    tempo: r(p10 + 10, p10 + 20),
    intervals: r(p5 - 5, p5 + 5),
  } satisfies Partial<Record<EnduranceType, [number, number]>>;
}

export type RaceDistance = 5 | 10 | 21.0975 | number;

export interface RunPlanWeek {
  week: number;
  recovery: boolean;
  sessions: RunSpec[];
  totalMin: number;
}

/**
 * Plan de carrera prudente: progresión ~5–8 %/semana del volumen en minutos, semana de
 * descarga cada 4.ª, 1 sesión de calidad (2 si ≥ 4 días y nivel intermedio), tirada larga ≤ 30 % del total.
 * No es una garantía de seguridad: depende de cómo te recuperes.
 */
export function buildRunPlan(opts: {
  distanceKm: RaceDistance;
  weeks: number;
  daysPerWeek: number;
  currentWeeklyMin: number;
  level: "beginner" | "intermediate";
  ref?: { distanceKm: number; timeSec: number } | null;
}): RunPlanWeek[] {
  const days = Math.min(5, Math.max(2, Math.round(opts.daysPerWeek)));
  const start = Math.max(60, opts.currentWeeklyMin);
  const peakCap = opts.distanceKm >= 21 ? 330 : opts.distanceKm >= 10 ? 260 : 200;
  const guide = paceGuide(opts.ref);
  const plan: RunPlanWeek[] = [];
  let vol = start;
  for (let w = 1; w <= opts.weeks; w++) {
    const taper = w === opts.weeks;
    const recovery = !taper && w % 4 === 0;
    if (w > 1 && !recovery && !taper && plan[w - 2] && !plan[w - 2].recovery) vol = Math.min(peakCap, vol * 1.07);
    const total = Math.round(taper ? vol * 0.6 : recovery ? vol * 0.75 : vol);
    const longMin = Math.round(Math.min(total * 0.3, opts.distanceKm >= 21 ? 130 : 95));
    const quality = taper ? 1 : days >= 4 && opts.level === "intermediate" ? 2 : 1;
    const sessions: RunSpec[] = [];
    if (taper) {
      sessions.push({ type: "race", distanceKm: opts.distanceKm, structure: "Competición / test", paceSecPerKm: null });
    } else {
      sessions.push({ type: "long", durationMin: longMin, paceSecPerKm: guide?.long ?? null, structure: "Ritmo cómodo y conversacional", hrZone: "Z2" });
    }
    const qTypes: EnduranceType[] = w % 2 === 0 ? ["intervals", "tempo"] : ["tempo", "hills"];
    for (let q = 0; q < quality && !recovery; q++) {
      const type = qTypes[q];
      sessions.push({
        type,
        durationMin: Math.round(Math.min(55, total * 0.2)),
        paceSecPerKm: type === "intervals" ? guide?.intervals ?? null : type === "tempo" ? guide?.tempo ?? null : null,
        structure:
          type === "intervals" ? "Calentamiento 15′ · 5–6 × 3′ fuerte / 2′ suave · vuelta a la calma"
          : type === "tempo" ? "Calentamiento 15′ · 2 × 10′ a ritmo umbral cómodo · vuelta a la calma"
          : "Calentamiento 15′ · 6–8 cuestas de 45″ · vuelta a la calma",
        hrZone: type === "tempo" ? "Z3–Z4" : "Z4–Z5",
      });
    }
    const used = sessions.reduce((a, s) => a + (s.durationMin ?? 0), 0);
    const easyCount = Math.max(0, days - sessions.length);
    for (let e = 0; e < easyCount; e++) {
      sessions.push({ type: e === 0 && recovery ? "recovery" : "easy", durationMin: Math.max(20, Math.round((total - used) / Math.max(1, easyCount))), paceSecPerKm: guide?.easy ?? null, hrZone: "Z1–Z2" });
    }
    plan.push({ week: w, recovery, sessions, totalMin: sessions.reduce((a, s) => a + (s.durationMin ?? 0), 0) });
  }
  return plan;
}

export const SPORT_LABEL: Record<string, string> = {
  run: "Carrera", bike: "Bici", walk: "Caminata", treadmill: "Cinta", mobility: "Movilidad", swim: "Natación", other: "Otro",
};
export const TYPE_LABEL: Record<EnduranceType, string> = {
  recovery: "Recuperación", easy: "Rodaje fácil", long: "Tirada larga", tempo: "Tempo/umbral", intervals: "Intervalos",
  hills: "Cuestas", technique: "Técnica", race: "Competición", endurance: "Resistencia", commute: "Desplazamiento", other: "Otro",
};

export const isHardType = (t?: EnduranceType | null) => t === "intervals" || t === "tempo" || t === "hills" || t === "race";
