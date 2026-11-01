/**
 * Contexto retrospectivo actividad/comidas ↔ glucosa. SOLO descriptivo: "observaciones para
 * revisar con tu equipo". No predice respuestas, no infiere causalidad, no sugiere tratamiento.
 */
export interface Reading {
  ms: number;
  mgdl: number;
}

export interface ActivityWindow {
  id: string;
  label: string;
  group: string;
  start: number;
  end: number;
}

export interface ActivityGlucose {
  id: string;
  label: string;
  group: string;
  start: number;
  atStart: number | null;
  atEnd: number | null;
  minDuring: number | null;
  maxDuring: number | null;
  delta: number | null;
  min24hAfter: number | null;
  below70During: boolean;
  below70After24h: boolean;
  coverageOk: boolean;
}

function nearest(rs: Reading[], t: number, tolMin = 20): number | null {
  let best: Reading | null = null;
  let bd = Infinity;
  for (const r of rs) {
    const d = Math.abs(r.ms - t);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return best && bd <= tolMin * 60000 ? best.mgdl : null;
}

export function activityGlucose(sortedReadings: Reading[], acts: ActivityWindow[]): ActivityGlucose[] {
  return acts.map((a) => {
    const around = sortedReadings.filter((r) => r.ms >= a.start - 30 * 60000 && r.ms <= a.end + 24 * 3600000);
    const during = around.filter((r) => r.ms >= a.start && r.ms <= a.end);
    const after = around.filter((r) => r.ms > a.end && r.ms <= a.end + 24 * 3600000);
    const atStart = nearest(around, a.start);
    const atEnd = nearest(around, a.end);
    const durMin = (a.end - a.start) / 60000;
    const coverageOk = atStart != null && atEnd != null && (durMin < 30 || during.length >= Math.floor(durMin / 30));
    return {
      id: a.id, label: a.label, group: a.group, start: a.start, atStart, atEnd,
      minDuring: during.length ? Math.min(...during.map((r) => r.mgdl)) : null,
      maxDuring: during.length ? Math.max(...during.map((r) => r.mgdl)) : null,
      delta: atStart != null && atEnd != null ? atEnd - atStart : null,
      min24hAfter: after.length ? Math.min(...after.map((r) => r.mgdl)) : null,
      below70During: during.some((r) => r.mgdl < 70),
      below70After24h: after.some((r) => r.mgdl < 70),
      coverageOk,
    };
  });
}

export interface GroupSummary {
  group: string;
  n: number;
  medianDelta: number | null;
  withBelow70During: number;
  withBelow70After: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function summarizeGroups(rows: ActivityGlucose[]): GroupSummary[] {
  const groups = new Map<string, ActivityGlucose[]>();
  rows.filter((r) => r.coverageOk).forEach((r) => groups.set(r.group, [...(groups.get(r.group) ?? []), r]));
  return [...groups.entries()].map(([group, xs]) => ({
    group,
    n: xs.length,
    medianDelta: median(xs.map((x) => x.delta!).filter((x) => x != null)),
    withBelow70During: xs.filter((x) => x.below70During).length,
    withBelow70After: xs.filter((x) => x.below70After24h).length,
  }));
}

/** Frases de observación (sin recomendaciones terapéuticas). Mínimo 3 sesiones con datos. */
export function observations(groups: GroupSummary[]): string[] {
  const out: string[] = [];
  for (const g of groups) {
    if (g.n < 3) continue;
    if (g.medianDelta != null && Math.abs(g.medianDelta) >= 30) {
      out.push(`${g.group}: en ${g.n} sesiones con datos, la glucosa ${g.medianDelta < 0 ? "bajó" : "subió"} una mediana de ${Math.abs(Math.round(g.medianDelta))} mg/dL entre el inicio y el final.`);
    }
    if (g.withBelow70During >= 2) out.push(`${g.group}: hubo lecturas < 70 mg/dL durante ${g.withBelow70During} de ${g.n} sesiones.`);
    if (g.withBelow70After >= 2) out.push(`${g.group}: hubo lecturas < 70 mg/dL en las 24 h posteriores a ${g.withBelow70After} de ${g.n} sesiones (incluye la noche).`);
  }
  return out;
}

export interface MealGlucose {
  id: string;
  label: string;
  ts: number;
  carbsG: number | null;
  atMeal: number | null;
  peak: number | null;
  peakMinutes: number | null;
  rise: number | null;
}

export function mealGlucose(sortedReadings: Reading[], meals: { id: string; label: string; ts: number; carbsG: number | null }[]): MealGlucose[] {
  return meals.map((m) => {
    const win = sortedReadings.filter((r) => r.ms >= m.ts && r.ms <= m.ts + 3 * 3600000);
    const at = nearest(sortedReadings.filter((r) => Math.abs(r.ms - m.ts) <= 20 * 60000), m.ts);
    const peakR = win.length ? win.reduce((a, b) => (b.mgdl > a.mgdl ? b : a)) : null;
    return {
      id: m.id, label: m.label, ts: m.ts, carbsG: m.carbsG, atMeal: at,
      peak: peakR?.mgdl ?? null,
      peakMinutes: peakR ? Math.round((peakR.ms - m.ts) / 60000) : null,
      rise: at != null && peakR ? peakR.mgdl - at : null,
    };
  });
}
