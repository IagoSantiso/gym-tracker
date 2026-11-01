/**
 * Métricas CGM (Consenso Internacional TIR, Battelino 2019; GMI, Bergenstal 2018).
 *  - Se calculan con lecturas HISTÓRICAS (automáticas) para no sesgar con escaneos.
 *  - Clasificación en la UNIDAD ORIGINAL con umbrales equivalentes (3,0/3,9/10,0/13,9 mmol/L)
 *    para no desplazar lecturas en los límites por conversión.
 *  - GMI solo con ≥ 14 días y ≥ 70 % de datos; si no, null y motivo.
 */
import type { GlucoseUnit } from "@/lib/db/types";
import { MGDL_PER_MMOL } from "@/lib/domain/units";

export interface Ranges {
  veryLow: number;
  low: number;
  high: number;
  veryHigh: number;
}
export const CONSENSUS_RANGES: Ranges = { veryLow: 54, low: 70, high: 180, veryHigh: 250 };

export interface R {
  ms: number;
  mgdl: number;
  originalValue?: number;
  originalUnit?: GlucoseUnit;
}

export type Band = "vlow" | "low" | "in" | "high" | "vhigh";

const toMmol1 = (mgdl: number) => Math.round((mgdl / MGDL_PER_MMOL) * 10) / 10;

export function classify(r: R, rg: Ranges): Band {
  if (r.originalUnit === "mmol/L" && r.originalValue != null) {
    const v = r.originalValue;
    if (v < toMmol1(rg.veryLow)) return "vlow";
    if (v < toMmol1(rg.low)) return "low";
    if (v <= toMmol1(rg.high)) return "in";
    if (v <= toMmol1(rg.veryHigh)) return "high";
    return "vhigh";
  }
  const v = r.mgdl;
  if (v < rg.veryLow) return "vlow";
  if (v < rg.low) return "low";
  if (v <= rg.high) return "in";
  if (v <= rg.veryHigh) return "high";
  return "vhigh";
}

export function medianInterval(rs: R[]): number {
  if (rs.length < 3) return 15;
  const d: number[] = [];
  for (let i = 1; i < rs.length; i++) {
    const m = (rs[i].ms - rs[i - 1].ms) / 60000;
    if (m > 0 && m < 120) d.push(m);
  }
  if (!d.length) return 15;
  d.sort((a, b) => a - b);
  const med = d[Math.floor(d.length / 2)];
  return Math.round(med) || 15;
}

export interface Gap {
  start: number;
  end: number;
  minutes: number;
}

export interface CgmMetrics {
  n: number;
  periodStart: number;
  periodEnd: number;
  days: number;
  intervalMin: number;
  expected: number;
  coveragePct: number;
  firstTs: number | null;
  lastTs: number | null;
  mean: number | null;
  sd: number | null;
  cv: number | null;
  gmi: number | null;
  gmiReason: string | null;
  pct: Record<Band, number>;
  pctBelow70: number;
  pctAbove180: number;
  gaps: Gap[];
  sufficient: boolean;
  sufficiencyNotes: string[];
}

/**
 * @param nominalIntervalMin intervalo nominal del sensor (Libre: 15 min en registros históricos).
 *   Si no se indica, se usa la mediana observada con tope de 15 min (los huecos no deben inflar la cobertura).
 */
export function computeMetrics(all: R[], periodStart: number, periodEnd: number, rg: Ranges = CONSENSUS_RANGES, nominalIntervalMin?: number): CgmMetrics {
  const rs = all.filter((r) => r.ms >= periodStart && r.ms < periodEnd).sort((a, b) => a.ms - b.ms);
  const n = rs.length;
  const intervalMin = nominalIntervalMin ?? Math.min(15, medianInterval(rs));
  const durationMin = Math.max(1, (periodEnd - periodStart) / 60000);
  const expected = Math.floor(durationMin / intervalMin);
  const coveragePct = expected ? Math.min(100, (n / expected) * 100) : 0;
  const days = durationMin / 1440;
  const pct: Record<Band, number> = { vlow: 0, low: 0, in: 0, high: 0, vhigh: 0 };
  let sum = 0;
  for (const r of rs) {
    pct[classify(r, rg)]++;
    sum += r.mgdl;
  }
  const mean = n ? sum / n : null;
  let sd: number | null = null;
  if (n > 1 && mean != null) sd = Math.sqrt(rs.reduce((a, r) => a + (r.mgdl - mean) ** 2, 0) / (n - 1));
  (Object.keys(pct) as Band[]).forEach((k) => (pct[k] = n ? (pct[k] / n) * 100 : 0));
  const gaps: Gap[] = [];
  const gapMin = Math.max(45, intervalMin * 3);
  let prev = periodStart;
  for (const r of [...rs, { ms: periodEnd } as R]) {
    const m = (r.ms - prev) / 60000;
    if (m > gapMin) gaps.push({ start: prev, end: r.ms, minutes: Math.round(m) });
    prev = r.ms;
  }
  const notes: string[] = [];
  if (days < 14) notes.push(`Periodo de ${Math.round(days * 10) / 10} días: el consenso recomienda ≥ 14 días para conclusiones.`);
  if (coveragePct < 70) notes.push(`Cobertura del ${Math.round(coveragePct)} %: el consenso recomienda ≥ 70 % de datos.`);
  const sufficient = days >= 14 && coveragePct >= 70;
  const gmi = sufficient && mean != null ? 3.31 + 0.02392 * mean : null;
  return {
    n, periodStart, periodEnd, days, intervalMin, expected, coveragePct,
    firstTs: rs[0]?.ms ?? null, lastTs: rs.at(-1)?.ms ?? null,
    mean, sd, cv: sd != null && mean ? (sd / mean) * 100 : null,
    gmi: gmi != null ? Math.round(gmi * 10) / 10 : null,
    gmiReason: gmi == null ? "El GMI requiere ≥ 14 días y ≥ 70 % de datos." : null,
    pct, pctBelow70: pct.vlow + pct.low, pctAbove180: pct.high + pct.vhigh,
    gaps, sufficient, sufficiencyNotes: notes,
  };
}

/** Objetivos generales del consenso (contexto, NO objetivos personales). */
export const CONSENSUS_GOALS = [
  { key: "in", label: "Tiempo en rango 70–180", goal: "> 70 %" },
  { key: "below70", label: "Por debajo de 70", goal: "< 4 %" },
  { key: "vlow", label: "Por debajo de 54", goal: "< 1 %" },
  { key: "above180", label: "Por encima de 180", goal: "< 25 %" },
  { key: "vhigh", label: "Por encima de 250", goal: "< 5 %" },
  { key: "cv", label: "Coeficiente de variación", goal: "≤ 36 %" },
] as const;

/** Métricas por franja horaria local (minutos del día ya calculados por el llamante). */
export function byTimeBlock(rs: (R & { minuteOfDay: number })[], rg: Ranges = CONSENSUS_RANGES) {
  const blocks = [
    { id: "night", label: "Madrugada 0–6 h", from: 0, to: 360 },
    { id: "morning", label: "Mañana 6–12 h", from: 360, to: 720 },
    { id: "afternoon", label: "Tarde 12–18 h", from: 720, to: 1080 },
    { id: "evening", label: "Noche 18–24 h", from: 1080, to: 1440 },
  ];
  return blocks.map((b) => {
    const sel = rs.filter((r) => r.minuteOfDay >= b.from && r.minuteOfDay < b.to);
    const n = sel.length;
    const count = (band: Band) => sel.filter((r) => classify(r, rg) === band).length;
    return {
      ...b, n,
      mean: n ? sel.reduce((a, r) => a + r.mgdl, 0) / n : null,
      pctIn: n ? (count("in") / n) * 100 : null,
      pctBelow70: n ? ((count("low") + count("vlow")) / n) * 100 : null,
      pctAbove180: n ? ((count("high") + count("vhigh")) / n) * 100 : null,
    };
  });
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
