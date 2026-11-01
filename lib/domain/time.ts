/**
 * Fechas y zonas horarias sin dependencias (Intl). Fechas de calendario "YYYY-MM-DD"
 * en la zona del usuario; instantes en ISO UTC.
 */

export const DEFAULT_TZ = "Europe/Madrid";

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

/** Componentes de pared (hora local) de un instante en una zona. */
export function wallParts(instant: Date | number | string, tz: string) {
  const d = new Date(instant);
  const parts = Object.fromEntries(dtf(tz).formatToParts(d).map((p) => [p.type, p.value]));
  return {
    year: +parts.year, month: +parts.month, day: +parts.day,
    hour: +parts.hour, minute: +parts.minute, second: +parts.second,
  };
}

/** Desfase (minutos) de la zona respecto a UTC en ese instante. */
export function tzOffsetMin(instant: number, tz: string): number {
  const p = wallParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60000);
}

export interface WallTime { year: number; month: number; day: number; hour: number; minute: number; second?: number }

/**
 * Convierte una hora de pared (p. ej. la del lector CGM, sin zona) a instante UTC.
 * - Hueco de primavera (hora inexistente): se interpreta con el desfase previo (se desplaza hacia delante).
 * - Solapamiento de otoño (hora repetida): devuelve la PRIMERA ocurrencia y `ambiguous: true`.
 */
export function zonedWallToUtc(w: WallTime, tz: string): { ms: number; ambiguous: boolean; nonexistent: boolean } {
  const naive = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second ?? 0);
  const candidates = new Set<number>();
  for (const probe of [naive - 36e5 * 14, naive, naive + 36e5 * 14]) {
    const off = tzOffsetMin(probe, tz);
    candidates.add(naive - off * 60000);
  }
  const valid = [...candidates].filter((ms) => {
    const p = wallParts(ms, tz);
    return p.year === w.year && p.month === w.month && p.day === w.day && p.hour === w.hour && p.minute === w.minute;
  }).sort((a, b) => a - b);
  if (valid.length >= 1) return { ms: valid[0], ambiguous: valid.length > 1, nonexistent: false };
  // Hueco: usar el desfase de justo antes del cambio
  const before = tzOffsetMin(naive - 36e5 * 3, tz);
  return { ms: naive - before * 60000, ambiguous: false, nonexistent: true };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha de calendario local "YYYY-MM-DD" de un instante. */
export function localDate(instant: Date | number | string = Date.now(), tz = DEFAULT_TZ): string {
  const p = wallParts(instant, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "HH:MM" local. */
export function localTime(instant: Date | number | string, tz = DEFAULT_TZ): string {
  const p = wallParts(instant, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Minutos desde medianoche local. */
export function minutesOfDay(instant: Date | number | string, tz = DEFAULT_TZ): number {
  const p = wallParts(instant, tz);
  return p.hour * 60 + p.minute;
}

/** Aritmética de fechas de calendario (sin zona, en UTC puro). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = lunes … 6 = domingo */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function weekStartOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}

export function dateRange(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

/** Instante UTC del inicio (00:00 local) de una fecha. */
export function startOfLocalDay(date: string, tz = DEFAULT_TZ): number {
  const [y, m, d] = date.split("-").map(Number);
  return zonedWallToUtc({ year: y, month: m, day: d, hour: 0, minute: 0 }, tz).ms;
}

export const WEEKDAYS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
export const WEEKDAYS_SHORT_ES = ["L", "M", "X", "J", "V", "S", "D"];

export function formatDateEs(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("es-ES", { ...opts, timeZone: "UTC" });
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h ? `${h} h ${pad(m)} min` : s && m < 10 ? `${m}:${pad(s)} min` : `${m} min`;
}

export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${pad(s)}`;
}
