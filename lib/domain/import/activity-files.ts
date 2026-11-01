/**
 * Importación de actividades desde TCX/GPX (formatos abiertos; Polar Flow los exporta).
 * Parser tolerante basado en expresiones (sin ejecutar nada del archivo). FIT: no soportado en v1.
 */
import type { Sport } from "@/lib/db/types";

export const MAX_ACTIVITY_BYTES = 25 * 1024 * 1024;

export interface ParsedActivity {
  sport: Sport;
  startedAt: string;
  durationSec: number;
  distanceM: number | null;
  elevationGainM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  points: { t: number; hr?: number; d?: number; alt?: number; lat?: number; lon?: number }[];
  externalId: string;
  format: "tcx" | "gpx";
}

const tag = (xml: string, name: string) => {
  const m = new RegExp(`<(?:\\w+:)?${name}[^>]*>([^<]*)</(?:\\w+:)?${name}>`, "i").exec(xml);
  return m ? m[1].trim() : null;
};
const all = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "gi"))].map((m) => m[0]);

function sportFrom(s: string | null): Sport {
  const t = (s ?? "").toLowerCase();
  if (/run|carrera|correr/.test(t)) return "run";
  if (/bik|cycl|ciclis|bici/.test(t)) return "bike";
  if (/walk|hik|camin|sender/.test(t)) return "walk";
  if (/swim|nata/.test(t)) return "swim";
  return "other";
}

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000;
  const toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLon = toR(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function finish(points: ParsedActivity["points"], start: number, base: Omit<ParsedActivity, "avgHr" | "maxHr" | "elevationGainM" | "points">): ParsedActivity {
  const hrs = points.map((p) => p.hr).filter((h): h is number => h != null && h > 30 && h < 230);
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const d = (points[i].alt ?? NaN) - (points[i - 1].alt ?? NaN);
    if (d > 0.5) gain += d;
  }
  return {
    ...base,
    avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
    maxHr: hrs.length ? Math.max(...hrs) : null,
    elevationGainM: points.some((p) => p.alt != null) ? Math.round(gain) : null,
    points: points.map((p) => ({ ...p, t: Math.round((p.t - start) / 1000) })),
  };
}

export function parseTcx(xml: string): ParsedActivity[] {
  return all(xml, "Activity").map((act) => {
    const sport = sportFrom(/Sport="([^"]+)"/i.exec(act)?.[1] ?? null);
    const id = tag(act, "Id") ?? "";
    const laps = all(act, "Lap");
    const dur = laps.reduce((a, l) => a + Number(tag(l, "TotalTimeSeconds") ?? 0), 0);
    const dist = laps.reduce((a, l) => a + Number(tag(l, "DistanceMeters") ?? 0), 0);
    const tps = all(act, "Trackpoint").map((tp) => ({
      t: Date.parse(tag(tp, "Time") ?? ""),
      hr: (() => { const v = /<(?:\w+:)?HeartRateBpm[^>]*>[\s\S]*?<(?:\w+:)?Value>(\d+)</i.exec(tp)?.[1]; return v ? Number(v) : undefined; })(),
      d: tag(tp, "DistanceMeters") != null ? Number(tag(tp, "DistanceMeters")) : undefined,
      alt: tag(tp, "AltitudeMeters") != null ? Number(tag(tp, "AltitudeMeters")) : undefined,
      lat: tag(tp, "LatitudeDegrees") != null ? Number(tag(tp, "LatitudeDegrees")) : undefined,
      lon: tag(tp, "LongitudeDegrees") != null ? Number(tag(tp, "LongitudeDegrees")) : undefined,
    })).filter((p) => Number.isFinite(p.t));
    const start = Date.parse(id) || tps[0]?.t || Date.parse(/StartTime="([^"]+)"/i.exec(act)?.[1] ?? "");
    if (!Number.isFinite(start)) throw new Error("TCX sin fecha de inicio");
    return finish(tps, start, {
      sport, startedAt: new Date(start).toISOString(), durationSec: Math.round(dur || ((tps.at(-1)?.t ?? start) - start) / 1000),
      distanceM: dist ? Math.round(dist) : null, externalId: `tcx:${new Date(start).toISOString()}:${sport}`, format: "tcx",
    });
  });
}

export function parseGpx(xml: string): ParsedActivity[] {
  return all(xml, "trk").map((trk) => {
    const sport = sportFrom(tag(trk, "type") ?? tag(trk, "name"));
    const pts = [...trk.matchAll(/<trkpt\s+([^>]*)>([\s\S]*?)<\/trkpt>/gi)].map((m) => {
      const lat = Number(/lat="([^"]+)"/.exec(m[1])?.[1]);
      const lon = Number(/lon="([^"]+)"/.exec(m[1])?.[1]);
      const hr = /<(?:\w+:)?hr>(\d+)</i.exec(m[2])?.[1];
      return { t: Date.parse(tag(m[2], "time") ?? ""), lat, lon, alt: tag(m[2], "ele") != null ? Number(tag(m[2], "ele")) : undefined, hr: hr ? Number(hr) : undefined };
    }).filter((p) => Number.isFinite(p.t));
    if (!pts.length) throw new Error("GPX sin puntos con hora");
    let dist = 0;
    for (let i = 1; i < pts.length; i++) if (Number.isFinite(pts[i].lat) && Number.isFinite(pts[i - 1].lat)) dist += haversine(pts[i - 1], pts[i]);
    const start = pts[0].t;
    return finish(pts.map((p) => ({ ...p, d: undefined })), start, {
      sport, startedAt: new Date(start).toISOString(), durationSec: Math.round((pts.at(-1)!.t - start) / 1000),
      distanceM: Math.round(dist) || null, externalId: `gpx:${new Date(start).toISOString()}:${sport}`, format: "gpx",
    });
  });
}

export function parseActivityFile(name: string, text: string): ParsedActivity[] {
  if (text.length > MAX_ACTIVITY_BYTES) throw new Error("Archivo demasiado grande");
  if (!/^\s*(<\?xml|<)/.test(text)) throw new Error("No es un archivo XML (TCX/GPX)");
  if (/<!ENTITY/i.test(text)) throw new Error("XML con entidades no permitido");
  if (/\.tcx$/i.test(name) || /TrainingCenterDatabase/i.test(text)) return parseTcx(text);
  if (/\.gpx$/i.test(name) || /<gpx[\s>]/i.test(text)) return parseGpx(text);
  throw new Error("Formato no reconocido (usa TCX o GPX)");
}
