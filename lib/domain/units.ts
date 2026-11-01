/** Conversión de unidades con precisión controlada. */
import type { GlucoseUnit } from "@/lib/db/types";

/** 1 mmol/L de glucosa = 18,0156 mg/dL (masa molar 180,156 g/mol). */
export const MGDL_PER_MMOL = 18.0156;

export const mmolToMgdl = (v: number) => v * MGDL_PER_MMOL;
export const mgdlToMmol = (v: number) => v / MGDL_PER_MMOL;

export function toMgdl(value: number, unit: GlucoseUnit): number {
  return unit === "mmol/L" ? mmolToMgdl(value) : value;
}

export function fromMgdl(mgdl: number, unit: GlucoseUnit): number {
  return unit === "mmol/L" ? mgdlToMmol(mgdl) : mgdl;
}

/** Formato de presentación: mg/dL entero; mmol/L con 1 decimal. */
export function formatGlucose(mgdl: number, unit: GlucoseUnit, withUnit = true): string {
  const v = fromMgdl(mgdl, unit);
  const txt = unit === "mmol/L" ? v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : String(Math.round(v));
  return withUnit ? `${txt} ${unit}` : txt;
}

/** Redondeo a n decimales sin errores de coma flotante típicos (0.1+0.2). */
export function round(v: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round((v + Number.EPSILON) * f) / f;
}

export const kmhToSecPerKm = (kmh: number) => (kmh > 0 ? 3600 / kmh : 0);
export const secPerKmToKmh = (s: number) => (s > 0 ? 3600 / s : 0);

/** Parseo tolerante de números con coma decimal española. */
export function parseNum(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim().replace(/\s/g, "");
  if (!s) return null;
  // "1.234,5" -> 1234.5 ; "1,5" -> 1.5 ; "1.5" -> 1.5
  const norm = /,\d+$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

export const fmtNum = (v: number | null | undefined, decimals = 0) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("es-ES", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
