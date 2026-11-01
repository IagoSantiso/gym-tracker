/**
 * Episodios con reglas transparentes y configurables (consenso: ≥ 15 min para inicio y fin).
 * Cada lectura representa el tiempo hasta la siguiente (máx. 2× intervalo); huecos > maxGap cortan.
 * Es una descripción de datos, NO un diagnóstico.
 */
export interface EpisodeRule {
  id: string;
  label: string;
  type: "below" | "above";
  threshold: number;
  minMinutes: number;
  endMinutes: number;
}

export const DEFAULT_EPISODE_RULES: EpisodeRule[] = [
  { id: "hypo1", label: "Por debajo de 70 mg/dL ≥ 15 min", type: "below", threshold: 70, minMinutes: 15, endMinutes: 15 },
  { id: "hypo2", label: "Por debajo de 54 mg/dL ≥ 15 min", type: "below", threshold: 54, minMinutes: 15, endMinutes: 15 },
  { id: "hyper_ext", label: "Por encima de 250 mg/dL ≥ 120 min", type: "above", threshold: 250, minMinutes: 120, endMinutes: 15 },
];

export interface Episode {
  ruleId: string;
  start: number;
  end: number;
  minutes: number;
  extreme: number;
}

export function detectEpisodes(rs: { ms: number; mgdl: number }[], rule: EpisodeRule, intervalMin = 15, maxGapMin = 45): Episode[] {
  const out: Episode[] = [];
  const sorted = [...rs].sort((a, b) => a.ms - b.ms);
  const cond = (v: number) => (rule.type === "below" ? v < rule.threshold : v > rule.threshold);
  let cur: { start: number; last: number; inMin: number; outMin: number; extreme: number } | null = null;
  const close = () => {
    if (cur && cur.inMin >= rule.minMinutes) {
      out.push({ ruleId: rule.id, start: cur.start, end: cur.last, minutes: Math.round(cur.inMin), extreme: cur.extreme });
    }
    cur = null;
  };
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const next = sorted[i + 1];
    const gap = next ? (next.ms - r.ms) / 60000 : intervalMin;
    if (gap > maxGapMin) {
      if (cur && cond(r.mgdl)) {
        cur.inMin += intervalMin;
        cur.last = r.ms + intervalMin * 60000;
      }
      close();
      continue;
    }
    const dur = Math.min(gap, intervalMin * 2);
    if (cond(r.mgdl)) {
      if (!cur) cur = { start: r.ms, last: r.ms, inMin: 0, outMin: 0, extreme: r.mgdl };
      cur.inMin += dur;
      cur.outMin = 0;
      cur.last = r.ms + dur * 60000;
      cur.extreme = rule.type === "below" ? Math.min(cur.extreme, r.mgdl) : Math.max(cur.extreme, r.mgdl);
    } else if (cur) {
      cur.outMin += dur;
      if (cur.outMin >= rule.endMinutes) close();
    }
  }
  close();
  return out;
}
