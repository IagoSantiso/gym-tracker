import "server-only";
/**
 * Límites en memoria por usuario (por instancia; en serverless es una protección básica).
 * Para límites globales usar un almacén compartido (p. ej. Upstash/Supabase).
 */
const minute = new Map<string, number[]>();
const daily = new Map<string, { day: string; tokens: number; requests: number }>();

const PER_MIN = Number(process.env.AI_RATE_PER_MINUTE ?? 12);
const PER_DAY = Number(process.env.AI_REQUESTS_PER_DAY ?? 300);
const TOKENS_PER_DAY = Number(process.env.AI_DAILY_TOKEN_BUDGET ?? 2_000_000);

export function checkLimits(key: string): string | null {
  const now = Date.now();
  const w = (minute.get(key) ?? []).filter((t) => now - t < 60_000);
  if (w.length >= PER_MIN) return "Demasiadas peticiones seguidas. Espera un minuto.";
  const day = new Date().toISOString().slice(0, 10);
  const d = daily.get(key);
  const cur = d && d.day === day ? d : { day, tokens: 0, requests: 0 };
  if (cur.requests >= PER_DAY || cur.tokens >= TOKENS_PER_DAY) return "Has alcanzado el límite diario del asistente.";
  w.push(now);
  minute.set(key, w);
  cur.requests++;
  daily.set(key, cur);
  return null;
}

export function recordTokens(key: string, tokens: number) {
  const d = daily.get(key);
  if (d) d.tokens += tokens;
}
