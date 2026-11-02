/** Métricas publicadas en un informe AGP. Nunca fabrica lecturas a partir de gráficas. */
import { toMgdl } from "@/lib/domain/units";
import type { GlucoseUnit } from "@/lib/db/types";

export const AGP_PDF_VERSION = "agp-pdf-2.0";
export interface AgpPdfSummary {
  pctVeryHigh?: number; pctHigh?: number; pctInRange?: number; pctLow?: number; pctVeryLow?: number;
  meanMgdl?: number; gmi?: number; cv?: number; activePct?: number;
  rangeLowMgdl?: number; rangeHighMgdl?: number; veryLowMgdl?: number; veryHighMgdl?: number;
  periodText?: string; periodStartDate?: string; periodEndDate?: string;
  reportedUnit?: GlucoseUnit; sourcePage?: number;
  found: string[]; warnings: string[];
}
const number = (s: string) => Number(s.replace(",", "."));
const normal = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim();
const MONTHS: Record<string, number> = {};
[
  ["enero", "ene", "january", "jan"], ["febrero", "feb", "february"], ["marzo", "mar", "march"],
  ["abril", "abr", "april", "apr"], ["mayo", "may"], ["junio", "jun", "june"],
  ["julio", "jul", "july"], ["agosto", "ago", "august", "aug"], ["septiembre", "sep", "sept", "september"],
  ["octubre", "oct", "october"], ["noviembre", "nov", "november"], ["diciembre", "dic", "december", "dec"],
].forEach((names, i) => names.forEach((name) => { MONTHS[name] = i + 1; }));
const month = Object.keys(MONTHS).join("|");
const datePattern = `(?:(?:${month})\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+(?:de\\s+)?(?:${month})\\.?\\s+(?:de\\s+)?\\d{4}|\\d{1,2}[/.]\\d{1,2}[/.]\\d{4})`;
function calendarDate(s: string): string | undefined {
  const t = s.toLowerCase().replace(/\./g, "").replace(/\bde\b/g, "").replace(/,/g, " ").trim();
  const parts = t.split(/\s+/);
  let y: number, m: number, d: number;
  if (parts.length === 3) {
    y = +parts[2]; m = MONTHS[parts[0]] ?? MONTHS[parts[1]]; d = MONTHS[parts[0]] ? +parts[1] : +parts[0];
  } else {
    const v = s.split(/[/.]/).map(Number); [d, m, y] = v;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
const METRICS = ["pctVeryHigh", "pctHigh", "pctInRange", "pctLow", "pctVeryLow", "meanMgdl", "gmi", "cv", "activePct"] as const;
export const hasAgpMetrics = (s: AgpPdfSummary) => METRICS.some((k) => s[k] != null);
/** Solo campos conocidos, sin nombres, texto del PDF ni datos terapéuticos. */
export function agpSummaryRecord(s: AgpPdfSummary): Record<string, number | string> {
  const fields = [...METRICS, "periodText", "periodStartDate", "periodEndDate", "reportedUnit", "sourcePage", "rangeLowMgdl", "rangeHighMgdl", "veryLowMgdl", "veryHighMgdl"] as const;
  return Object.fromEntries(fields.flatMap((k) => s[k] == null ? [] : [[k, s[k]!]]));
}

export function parseAgpText(text: string): AgpPdfSummary {
  const pages = text.split("\f").map(normal);
  const candidates = pages.map((p, i) => ({ p, i })).filter(({ p }) => /(?:informe AGP|AGP report|ambulatory glucose profile)/i.test(p));
  const chosen = candidates[0] ?? { p: pages[0] ?? "", i: 0 };
  // No se mezclan métricas de otras páginas, otros periodos, gráficas ni resúmenes mensuales.
  const t = chosen.p;
  const out: AgpPdfSummary = { found: [], warnings: [], sourcePage: chosen.i + 1 };
  if (candidates.length > 1) out.warnings.push("Hay varios informes AGP: se ha leído el primero. Importa cada periodo en un archivo separado.");
  const set = (key: keyof AgpPdfSummary, v: number, max = 100, min = 0) => {
    if (!Number.isFinite(v) || v < min || v > max) { out.warnings.push(`Valor no válido en ${key}; revisa el informe original.`); return; }
    (out as unknown as Record<string, number>)[key] = v;
  };
  const grab = (key: keyof AgpPdfSummary, pattern: RegExp, max = 100) => {
    const matches = [...t.matchAll(new RegExp(pattern.source, "gi"))].map((m) => number(m[1]));
    const values = [...new Set(matches)];
    if (values.length === 1) set(key, values[0], max);
    else if (values.length > 1) out.warnings.push(`Valores contradictorios en ${key}; no se ha importado esa métrica.`);
  };
  // Exige que el porcentaje siga a la etiqueta/rango, sin «Mayor que»/«Menor que» de los objetivos.
  const n = "\\d{1,3}(?:[.,]\\d{1,2})?";
  const range = `(?:[<>≤≥]\\s*)?${n}(?:\\s*-\\s*${n})?\\s*(?:mg\\s*/\\s*dL|mmol\\s*/\\s*L)`;
  const rows = new RegExp(`\\b(muy alto|very high|alto|high|intervalo objetivo|rango objetivo|target range|en rango|in range|muy bajo|very low|bajo|low)\\b\\s*(?:(${range})\\s*)?(${n})\\s*%`, "gi");
  const labels: Record<string, keyof AgpPdfSummary> = { "muy alto": "pctVeryHigh", "very high": "pctVeryHigh", alto: "pctHigh", high: "pctHigh", "intervalo objetivo": "pctInRange", "rango objetivo": "pctInRange", "target range": "pctInRange", "en rango": "pctInRange", "in range": "pctInRange", "muy bajo": "pctVeryLow", "very low": "pctVeryLow", bajo: "pctLow", low: "pctLow" };
  const seen = new Map<keyof AgpPdfSummary, Set<number>>();
  for (const m of t.matchAll(rows)) {
    const key = labels[m[1].toLowerCase()];
    const values = seen.get(key) ?? new Set<number>(); values.add(number(m[3])); seen.set(key, values);
    if (m[2]) {
      const unit: GlucoseUnit = /mmol/i.test(m[2]) ? "mmol/L" : "mg/dL";
      const bounds = [...m[2].matchAll(/\d+(?:[.,]\d+)?/g)].map((v) => toMgdl(number(v[0]), unit));
      out.reportedUnit = unit;
      if (key === "pctInRange" && bounds.length === 2) { out.rangeLowMgdl = bounds[0]; out.rangeHighMgdl = bounds[1]; }
      if (key === "pctVeryLow" && bounds.length === 1) out.veryLowMgdl = bounds[0];
      if (key === "pctVeryHigh" && bounds.length === 1) out.veryHighMgdl = bounds[0];
    }
  }
  for (const [key, values] of seen) {
    if (values.size === 1) set(key, [...values][0]);
    else out.warnings.push(`Valores contradictorios en ${key}; no se ha importado esa métrica.`);
  }
  const mean = /(?:glucosa (?:promedio|media)|(?:average|mean) glucose)\s*:?\s*(\d+(?:[.,]\d+)?)\s*(mg\s*\/\s*dL|mmol\s*\/\s*L)/gi;
  const means = [...t.matchAll(mean)];
  if (means.length) {
    const values = [...new Set(means.map((m) => toMgdl(number(m[1]), /mmol/i.test(m[2]) ? "mmol/L" : "mg/dL")))];
    if (values.length === 1) { set("meanMgdl", values[0], 600, 20); out.reportedUnit ??= /mmol/i.test(means[0][2]) ? "mmol/L" : "mg/dL"; }
    else out.warnings.push("Glucosa media contradictoria: revisa el informe.");
  }
  grab("gmi", /(?:\bGMI\b\s*\)?|glucose management indicator\s*(?:\(GMI\))?|indicador de gestion de (?:la )?glucosa\s*(?:\(GMI\))?)\s*:?\s*(\d{1,2}(?:[.,]\d+)?)\s*%/i, 20);
  grab("cv", /(?:glucose variability|coefficient of variation|variabilidad de (?:la )?glucosa|coeficiente de variacion)\s*(?:\(%?CV\))?\s*:?\s*(\d{1,2}(?:[.,]\d+)?)\s*%/i);
  grab("activePct", /(?:time cgm is active|sensor (?:is )?active|tiempo activo del sensor|tiempo (?:con el|que el) (?:sensor|MCG) (?:esta )?activo)\s*:?\s*(\d{1,3}(?:[.,]\d+)?)\s*%/i);
  const period = new RegExp(`(${datePattern})\\s*(?:-|a|to)\\s*(${datePattern})`, "i").exec(t);
  if (period) {
    const start = calendarDate(period[1]), end = calendarDate(period[2]);
    if (start && end && start <= end) { out.periodStartDate = start; out.periodEndDate = end; out.periodText = `${start} – ${end}`; }
    else out.warnings.push("No se pudo validar el periodo del informe.");
  }
  if (!out.periodStartDate) out.warnings.push("Periodo no reconocido; las métricas no se asignarán a fechas inventadas.");
  const tir = [out.pctVeryHigh, out.pctHigh, out.pctInRange, out.pctLow, out.pctVeryLow];
  if (tir.every((v) => v != null) && Math.abs(tir.reduce<number>((sum, v) => sum + v!, 0) - 100) > 2) {
    for (const k of ["pctVeryHigh", "pctHigh", "pctInRange", "pctLow", "pctVeryLow"] as const) delete out[k];
    out.warnings.push("Los tiempos en rangos no suman aproximadamente 100 %; se han omitido para evitar datos incorrectos.");
  }
  out.found = Object.keys(agpSummaryRecord(out));
  return out;
}
export function isPdf(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}
