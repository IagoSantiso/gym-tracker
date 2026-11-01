/**
 * Perfil ambulatorio de glucosa (AGP): percentiles 5/25/50/75/95 por franja de 15 min
 * del día (hora local). Ligero suavizado circular (media de 3 franjas) como en los informes AGP.
 * Requiere ≥ 5 días para mostrarse; con < 14 días se avisa.
 */
import { percentile } from "./metrics";

export interface AgpBin {
  minute: number;
  n: number;
  p5: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
}

export function computeAgp(readings: { mgdl: number; minuteOfDay: number }[], binMin = 15, minPerBin = 5): AgpBin[] {
  const nb = Math.round(1440 / binMin);
  const bins: number[][] = Array.from({ length: nb }, () => []);
  for (const r of readings) bins[Math.min(nb - 1, Math.floor(r.minuteOfDay / binMin))].push(r.mgdl);
  // suavizado: cada franja usa sus valores y los de las vecinas
  return bins.map((_, i) => {
    const vals = [...bins[(i - 1 + nb) % nb], ...bins[i], ...bins[(i + 1) % nb]].sort((a, b) => a - b);
    const ok = bins[i].length >= minPerBin;
    const q = (p: number) => (ok ? Math.round(percentile(vals, p)) : null);
    return { minute: i * binMin, n: bins[i].length, p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95) };
  });
}
