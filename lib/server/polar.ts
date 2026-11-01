import "server-only";
/** Cliente mínimo de Polar AccessLink v3 (https://www.polar.com/accesslink-api/). */

export const POLAR = {
  authUrl: "https://flow.polar.com/oauth2/authorization",
  tokenUrl: "https://polarremote.com/v2/oauth2/token",
  api: "https://www.polaraccesslink.com/v3",
  cookie: "nexo_polar",
  stateCookie: "nexo_polar_state",
};

export const polarConfigured = () => !!(process.env.POLAR_CLIENT_ID && process.env.POLAR_CLIENT_SECRET && process.env.TOKEN_ENCRYPTION_KEY);

export interface PolarSession {
  accessToken: string;
  userId: string;
  memberId: string;
  connectedAt: string;
}

export interface PolarExerciseOut {
  externalId: string;
  sport: "run" | "bike" | "walk" | "swim" | "other";
  startedAt: string;
  durationSec: number;
  distanceM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  detail: string | null;
}

/** "PT1H2M3.5S" → segundos */
export function isoDurationToSec(d: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(d ?? "");
  if (!m) return 0;
  return Math.round(Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0));
}

export function mapSport(s: string | undefined): PolarExerciseOut["sport"] {
  const t = (s ?? "").toUpperCase();
  if (t.includes("RUN") || t.includes("JOG")) return "run";
  if (t.includes("CYCL") || t.includes("BIK") || t.includes("SPINNING")) return "bike";
  if (t.includes("WALK") || t.includes("HIK")) return "walk";
  if (t.includes("SWIM")) return "swim";
  return "other";
}

/** start_time es hora local sin zona + start_time_utc_offset (min). */
export function toUtc(start: string, offsetMin: number | undefined): string {
  const naive = Date.parse(start.endsWith("Z") ? start : start + "Z");
  return new Date(naive - (offsetMin ?? 0) * 60000).toISOString();
}

export function mapExercise(e: Record<string, unknown>): PolarExerciseOut {
  const hr = (e.heart_rate ?? {}) as { average?: number; maximum?: number };
  return {
    externalId: `polar:${e.id}`,
    sport: mapSport((e.sport as string) ?? (e.detailed_sport_info as string)),
    startedAt: toUtc(String(e.start_time), e.start_time_utc_offset as number | undefined),
    durationSec: isoDurationToSec(String(e.duration ?? "")),
    distanceM: typeof e.distance === "number" ? Math.round(e.distance) : null,
    avgHr: hr.average ?? null,
    maxHr: hr.maximum ?? null,
    detail: (e.detailed_sport_info as string) ?? null,
  };
}
