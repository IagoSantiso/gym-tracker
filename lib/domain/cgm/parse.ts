/**
 * Importación de datos CGM desde CSV.
 *  - LibreView (Abbott): formato no documentado oficialmente; detección flexible ES/EN.
 *  - CSV genérico con mapeo manual de columnas.
 * La hora del CSV es hora LOCAL del lector sin zona: se convierte a UTC con la zona elegida.
 */
import type { GlucoseUnit } from "@/lib/db/types";
import { parseCsv } from "@/lib/domain/csv";
import { zonedWallToUtc } from "@/lib/domain/time";
import { parseNum, toMgdl } from "@/lib/domain/units";

export const PARSER_VERSION = "cgm-csv-1.1";
export const MAX_CSV_BYTES = 20 * 1024 * 1024;

export type DateOrder = "MDY" | "DMY" | "YMD";

export interface ParsedReading {
  localTime: string;
  ms: number;
  value: number;
  unit: GlucoseUnit;
  mgdl: number;
  kind: "historic" | "scan" | "strip";
  ambiguous: boolean;
  censored?: "low" | "high";
}

export interface ParsedEvent {
  localTime: string;
  ms: number;
  kind: "insulin" | "meal" | "note" | "ketone";
  value: number | null;
  unit: string | null;
  insulinType: "rapid" | "long" | null;
  note: string | null;
}

export interface ParseResult {
  format: "libreview_csv" | "generic_csv";
  unit: GlucoseUnit;
  dateOrder: DateOrder;
  dateOrderGuessed: boolean;
  device: string | null;
  readings: ParsedReading[];
  events: ParsedEvent[];
  rejected: { line: number; reason: string }[];
  duplicatesInFile: number;
  warnings: string[];
  headers: string[];
}

export interface ColumnMap {
  time: number;
  historic?: number;
  scan?: number;
  strip?: number;
  recordType?: number;
  rapidInsulin?: number;
  longInsulin?: number;
  carbs?: number;
  notes?: number;
  ketone?: number;
  device?: number;
}

const H = {
  time: /(device timestamp|timestamp|sello de tiempo|marca de tiempo|hora del dispositivo|fecha y hora|fecha\/hora|date ?time)/i,
  recordType: /(record type|tipo de registro)/i,
  historic: /(historic glucose|historial de glucosa|glucosa del historial|glucosa hist[oó]rica|historial glucosa)/i,
  scan: /(scan glucose|escaneo de glucosa|glucosa (de |del )?escaneo|glucosa escaneada)/i,
  strip: /(strip glucose|tira (reactiva )?de glucosa|glucosa (de|con) tira)/i,
  rapidInsulin: /(rapid-acting insulin \(units\)|insulina de acci[oó]n r[aá]pida \(unidades\))/i,
  longInsulin: /(long-acting insulin (value )?\(units\)|insulina de acci[oó]n (prolongada|lenta) .*\(unidades\)|valor de insulina de acci[oó]n prolongada)/i,
  carbs: /(carbohydrates \(grams\)|carbohidratos \(gramos\)|hidratos de carbono \(gramos\))/i,
  notes: /^(notes|notas)$/i,
  ketone: /(ketone|cetona)/i,
  device: /^(device|dispositivo)$/i,
  glucoseAny: /(glucose|glucosa)/i,
};

const pad = (n: number) => String(n).padStart(2, "0");

export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const r = rows[i];
    if (r.some((c) => H.time.test(c)) && r.some((c) => H.glucoseAny.test(c))) return i;
  }
  return -1;
}

export function detectColumns(header: string[]): { map: ColumnMap | null; unit: GlucoseUnit; spanish: boolean } {
  const idx = (re: RegExp) => header.findIndex((h) => re.test(h.trim()));
  const time = idx(H.time);
  const map: ColumnMap = { time };
  const set = (k: keyof ColumnMap, re: RegExp) => {
    const i = idx(re);
    if (i >= 0) map[k] = i;
  };
  set("historic", H.historic);
  set("scan", H.scan);
  set("strip", H.strip);
  set("recordType", H.recordType);
  set("rapidInsulin", H.rapidInsulin);
  set("longInsulin", H.longInsulin);
  set("carbs", H.carbs);
  set("notes", H.notes);
  set("ketone", H.ketone);
  set("device", H.device);
  const glucoseHeader = header[map.historic ?? map.scan ?? -1] ?? header.find((h) => H.glucoseAny.test(h)) ?? "";
  const unit: GlucoseUnit = /mmol/i.test(glucoseHeader) ? "mmol/L" : "mg/dL";
  const spanish = header.some((h) => /(glucosa|dispositivo|tipo de registro|sello)/i.test(h));
  return { map: time >= 0 && (map.historic != null || map.scan != null) ? map : null, unit, spanish };
}

const DATE_RE = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?/;

export function guessDateOrder(samples: string[], spanish: boolean): { order: DateOrder; guessed: boolean } {
  let firstGt12 = false;
  let secondGt12 = false;
  let ymd = false;
  for (const s of samples) {
    const m = DATE_RE.exec(s.trim());
    if (!m) continue;
    if (m[1].length === 4) ymd = true;
    if (+m[1] > 12 && m[1].length <= 2) firstGt12 = true;
    if (+m[2] > 12) secondGt12 = true;
  }
  if (ymd) return { order: "YMD", guessed: false };
  if (firstGt12 && !secondGt12) return { order: "DMY", guessed: false };
  if (secondGt12 && !firstGt12) return { order: "MDY", guessed: false };
  return { order: spanish ? "DMY" : "MDY", guessed: true };
}

export function parseWallTime(s: string, order: DateOrder) {
  const m = DATE_RE.exec(s.trim());
  if (!m) return null;
  let [y, mo, d] = order === "YMD" ? [+m[1], +m[2], +m[3]] : order === "DMY" ? [+m[3], +m[2], +m[1]] : [+m[3], +m[1], +m[2]];
  if (y < 100) y += 2000;
  let h = +m[4];
  const ampm = m[7]?.toLowerCase().replace(/\./g, "");
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  const mi = +m[5];
  const sec = m[6] ? +m[6] : 0;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1) return null;
  return { year: y, month: mo, day: d, hour: h, minute: mi, second: sec };
}

function glucoseValue(raw: string, unit: GlucoseUnit): { value: number; mgdl: number; censored?: "low" | "high" } | { error: string } | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^(lo|bajo|low)$/i.test(t)) return { value: unit === "mmol/L" ? 2.2 : 40, mgdl: 40, censored: "low" };
  if (/^(hi|alto|high)$/i.test(t)) return { value: unit === "mmol/L" ? 27.8 : 500, mgdl: 500, censored: "high" };
  const v = parseNum(t);
  if (v == null) return { error: `valor no numérico "${t.slice(0, 12)}"` };
  const mgdl = toMgdl(v, unit);
  if (mgdl < 10 || mgdl > 700) return { error: `valor fuera de rango plausible (${t} ${unit})` };
  return { value: v, mgdl };
}

export interface ParseOptions {
  timezone: string;
  dateOrder?: DateOrder;
  map?: ColumnMap;
  unit?: GlucoseUnit;
}

export function parseCgmCsv(text: string, opts: ParseOptions): ParseResult | { error: string; headers: string[]; rows: string[][] } {
  if (text.length > MAX_CSV_BYTES) return { error: "Archivo demasiado grande (máx. 20 MB).", headers: [], rows: [] };
  if (/[\u0000-\u0008]/.test(text.slice(0, 2000))) return { error: "El archivo no parece texto CSV.", headers: [], rows: [] };
  const rows = parseCsv(text);
  const hIdx = opts.map ? Math.max(0, findHeaderRow(rows)) : findHeaderRow(rows);
  if (hIdx < 0) return { error: "No se reconocen las columnas. Usa el mapeo manual.", headers: rows[0] ?? [], rows: rows.slice(0, 6) };
  const header = rows[hIdx].map((h) => h.trim());
  const det = detectColumns(header);
  const map = opts.map ?? det.map;
  if (!map) return { error: "No se encontró columna de glucosa. Usa el mapeo manual.", headers: header, rows: rows.slice(hIdx, hIdx + 6) };
  const unit = opts.unit ?? det.unit;
  const body = rows.slice(hIdx + 1);
  const guess = opts.dateOrder ? { order: opts.dateOrder, guessed: false } : guessDateOrder(body.slice(0, 400).map((r) => r[map.time] ?? ""), det.spanish);
  const res: ParseResult = {
    format: opts.map ? "generic_csv" : "libreview_csv", unit, dateOrder: guess.order, dateOrderGuessed: guess.guessed,
    device: map.device != null ? body.find((r) => r[map.device!])?.[map.device] ?? null : null,
    readings: [], events: [], rejected: [], duplicatesInFile: 0, warnings: [], headers: header,
  };
  const seen = new Set<string>();
  let ambiguous = 0;
  let nonexistent = 0;
  let censored = 0;
  body.forEach((r, i) => {
    const line = hIdx + i + 2;
    const tRaw = r[map.time] ?? "";
    const wt = parseWallTime(tRaw, guess.order);
    if (!wt) {
      res.rejected.push({ line, reason: `fecha no válida "${tRaw.slice(0, 20)}"` });
      return;
    }
    const conv = zonedWallToUtc(wt, opts.timezone);
    if (conv.ambiguous) ambiguous++;
    if (conv.nonexistent) nonexistent++;
    const localTime = `${wt.year}-${pad(wt.month)}-${pad(wt.day)}T${pad(wt.hour)}:${pad(wt.minute)}`;
    const recType = map.recordType != null ? (r[map.recordType] ?? "").trim() : "";
    const tryReading = (col: number | undefined, kind: ParsedReading["kind"]) => {
      if (col == null) return false;
      const g = glucoseValue(r[col] ?? "", unit);
      if (!g) return false;
      if ("error" in g) {
        res.rejected.push({ line, reason: g.error });
        return true;
      }
      const key = `${kind}:${conv.ms}`;
      if (seen.has(key)) {
        res.duplicatesInFile++;
        return true;
      }
      seen.add(key);
      if (g.censored) censored++;
      res.readings.push({ localTime, ms: conv.ms, value: g.value, unit, mgdl: g.mgdl, kind, ambiguous: conv.ambiguous, censored: g.censored });
      return true;
    };
    let any = false;
    if (!recType || recType === "0") any = tryReading(map.historic, "historic") || any;
    if (!recType || recType === "1") any = tryReading(map.scan, "scan") || any;
    any = tryReading(map.strip, "strip") || any;
    const ev = (col: number | undefined, kind: ParsedEvent["kind"], u: string | null, insulinType: ParsedEvent["insulinType"] = null) => {
      if (col == null) return;
      const raw = (r[col] ?? "").trim();
      if (!raw) return;
      const v = kind === "note" ? null : parseNum(raw);
      if (kind !== "note" && v == null) return;
      res.events.push({ localTime, ms: conv.ms, kind, value: v, unit: u, insulinType, note: kind === "note" ? raw.slice(0, 500) : null });
      any = true;
    };
    ev(map.rapidInsulin, "insulin", "U", "rapid");
    ev(map.longInsulin, "insulin", "U", "long");
    ev(map.carbs, "meal", "g");
    ev(map.notes, "note", null);
    ev(map.ketone, "ketone", "mmol/L");
    if (!any && recType && !["0", "1", "2", "4", "5", "6"].includes(recType)) res.rejected.push({ line, reason: `tipo de registro desconocido (${recType})` });
  });
  res.readings.sort((a, b) => a.ms - b.ms);
  if (guess.guessed) res.warnings.push(`El orden de la fecha (${guess.order === "DMY" ? "día-mes-año" : "mes-día-año"}) se ha deducido del idioma del archivo porque ningún día supera el 12. Compruébalo.`);
  if (ambiguous) res.warnings.push(`${ambiguous} registros caen en la hora repetida del cambio de horario de otoño; se asigna la primera ocurrencia.`);
  if (nonexistent) res.warnings.push(`${nonexistent} registros caen en la hora inexistente del cambio de primavera; se desplazan una hora.`);
  if (censored) res.warnings.push(`${censored} lecturas fuera del rango del sensor (LO/HI) se guardan con el valor límite (40 o 500 mg/dL).`);
  if (res.rejected.length) res.warnings.push(`${res.rejected.length} filas descartadas por datos no válidos.`);
  if (!res.readings.some((x) => x.kind === "historic") && res.readings.length) res.warnings.push("No hay lecturas históricas (automáticas): las métricas con solo escaneos son poco representativas.");
  return res;
}

/** Huella SHA-256 del archivo (detecta reimportaciones idénticas). */
export async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const readingDedupeKey = (kind: string, ms: number) => `${kind}:${ms}`;
