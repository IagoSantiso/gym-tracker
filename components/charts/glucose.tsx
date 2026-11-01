"use client";
import { useId, useRef, useState } from "react";
import type { AgpBin } from "@/lib/domain/cgm/agp";
import type { Band, Ranges } from "@/lib/domain/cgm/metrics";
import type { GlucoseUnit } from "@/lib/db/types";
import { formatGlucose, fromMgdl } from "@/lib/domain/units";
import { DataTable, Legend } from "./index";

const W = 640;

export const BAND_META: Record<Band, { label: (r: Ranges, u: GlucoseUnit) => string; color: string; symbol: string }> = {
  vhigh: { label: (r, u) => `Muy alto (> ${formatGlucose(r.veryHigh, u, false)})`, color: "var(--g-vhigh)", symbol: "▲▲" },
  high: { label: (r, u) => `Alto (${formatGlucose(r.high + (u === "mg/dL" ? 1 : 0.1 * 18.0156), u, false)}–${formatGlucose(r.veryHigh, u, false)})`, color: "var(--g-high)", symbol: "▲" },
  in: { label: (r, u) => `En rango (${formatGlucose(r.low, u, false)}–${formatGlucose(r.high, u, false)})`, color: "var(--g-in)", symbol: "●" },
  low: { label: (r, u) => `Bajo (${formatGlucose(r.veryLow, u, false)}–${formatGlucose(r.low - (u === "mg/dL" ? 1 : 0.1 * 18.0156), u, false)})`, color: "var(--g-low)", symbol: "▼" },
  vlow: { label: (r, u) => `Muy bajo (< ${formatGlucose(r.veryLow, u, false)})`, color: "var(--g-vlow)", symbol: "▼▼" },
};
const ORDER: Band[] = ["vhigh", "high", "in", "low", "vlow"];

/** Barra 100 % de tiempo en rangos + lista con valores y símbolos (no depende del color). */
export function TirBar({ pct, ranges, unit }: { pct: Record<Band, number>; ranges: Ranges; unit: GlucoseUnit }) {
  return (
    <div>
      <div className="tir" role="img" aria-label={ORDER.map((b) => `${BAND_META[b].label(ranges, unit)} ${pct[b].toFixed(1)} %`).join(", ")}>
        {ORDER.map((b) => pct[b] > 0 && <span key={b} style={{ width: `${pct[b]}%`, background: BAND_META[b].color }} />)}
      </div>
      <div className="tirlist">
        {ORDER.map((b) => (
          <div key={b}>
            <span aria-hidden style={{ color: BAND_META[b].color, fontSize: 11 }}>{BAND_META[b].symbol}</span>
            <span>{BAND_META[b].label(ranges, unit)}</span>
            <b className="num">{pct[b].toLocaleString("es-ES", { maximumFractionDigits: 1 })} %</b>
            <span className="xs dim num">{Math.round((pct[b] / 100) * 1440)} min/día</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Perfil AGP: 5–95 (banda clara), 25–75 (banda), mediana (línea), rango objetivo sombreado. */
export function AgpChart({ bins, ranges, unit, height = 260 }: { bins: AgpBin[]; ranges: Ranges; unit: GlucoseUnit; height?: number }) {
  const pad = { l: 44, r: 50, t: 10, b: 26 };
  const H = height;
  const yMax = Math.max(300, ...bins.map((b) => b.p95 ?? 0));
  const sy = (v: number) => pad.t + (1 - Math.min(v, yMax) / yMax) * (H - pad.t - pad.b);
  const sx = (m: number) => pad.l + (m / 1440) * (W - pad.l - pad.r);
  const valid = bins.filter((b) => b.p50 != null);
  const area = (lo: keyof AgpBin, hi: keyof AgpBin) => {
    const segs: string[] = [];
    let cur: AgpBin[] = [];
    const flush = () => {
      if (cur.length > 1) {
        const top = cur.map((b, i) => `${i ? "L" : "M"}${sx(b.minute + 7.5)},${sy(b[hi] as number)}`).join("");
        const bot = [...cur].reverse().map((b) => `L${sx(b.minute + 7.5)},${sy(b[lo] as number)}`).join("");
        segs.push(top + bot + "Z");
      }
      cur = [];
    };
    bins.forEach((b) => (b.p50 != null ? cur.push(b) : flush()));
    flush();
    return segs.join(" ");
  };
  const median = bins.reduce((d, b, i) => (b.p50 == null ? d : d + `${d && bins[i - 1]?.p50 != null ? "L" : "M"}${sx(b.minute + 7.5)},${sy(b.p50)}`), "");
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<AgpBin | null>(null);
  const id = useId();
  if (!valid.length) return <div className="empty-state">Datos insuficientes para el perfil AGP (se necesitan ≥ 5 lecturas por franja).</div>;
  const lines = [ranges.veryLow, ranges.low, ranges.high, ranges.veryHigh];
  const v = (x: number) => formatGlucose(x, unit, false);
  return (
    <figure style={{ margin: 0 }}>
      <div className="chartbox">
        <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={id}
          onPointerMove={(e) => {
            const r = ref.current!.getBoundingClientRect();
            const m = (((e.clientX - r.left) / r.width) * W - pad.l) / (W - pad.l - pad.r) * 1440;
            setHover(bins[Math.max(0, Math.min(bins.length - 1, Math.floor(m / 15)))] ?? null);
          }}
          onPointerLeave={() => setHover(null)}>
          <title id={id}>Perfil ambulatorio de glucosa (percentiles 5, 25, 50, 75 y 95 por hora del día)</title>
          <rect x={pad.l} width={W - pad.l - pad.r} y={sy(ranges.high)} height={sy(ranges.low) - sy(ranges.high)} fill="var(--g-in)" opacity={0.12} />
          {lines.map((y) => (
            <g key={y}>
              <line x1={pad.l} x2={W - pad.r} y1={sy(y)} y2={sy(y)} stroke={y === ranges.low || y === ranges.high ? "var(--g-in)" : "var(--chart-grid)"} strokeDasharray={y === ranges.low || y === ranges.high ? undefined : "3 4"} />
              <text x={W - pad.r + 4} y={sy(y) + 3}>{v(y)}</text>
            </g>
          ))}
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => <text key={h} x={sx(h * 60)} y={H - 8} textAnchor="middle">{String(h).padStart(2, "0")}h</text>)}
          <text x={pad.l - 6} y={pad.t + 8} textAnchor="end">{unit}</text>
          <path d={area("p5", "p95")} fill="var(--chart-2)" opacity={0.18} />
          <path d={area("p25", "p75")} fill="var(--chart-2)" opacity={0.38} />
          <path d={median} fill="none" stroke="var(--text)" strokeWidth={2} />
          {hover?.p50 != null && <line x1={sx(hover.minute + 7.5)} x2={sx(hover.minute + 7.5)} y1={pad.t} y2={H - pad.b} stroke="var(--line2)" />}
        </svg>
        {hover?.p50 != null && (
          <div className="tip" style={{ left: `${(sx(hover.minute + 7.5) / W) * 100}%`, top: `${(sy(hover.p95!) / H) * 100}%` }}>
            <div className="dim xs">{hh(hover.minute)}–{hh(hover.minute + 15)} · {hover.n} lecturas</div>
            <div>Mediana <b>{v(hover.p50)}</b></div>
            <div className="xs">P25–P75: {v(hover.p25!)}–{v(hover.p75!)}</div>
            <div className="xs">P5–P95: {v(hover.p5!)}–{v(hover.p95!)}</div>
          </div>
        )}
      </div>
      <Legend items={[{ label: "Mediana", color: "var(--text)" }, { label: "Percentiles 25–75", color: "var(--chart-2)", square: true }, { label: "Percentiles 5–95 (más claro)", color: "color-mix(in srgb, var(--chart-2) 40%, transparent)", square: true }, { label: "Rango objetivo", color: "color-mix(in srgb, var(--g-in) 30%, transparent)", square: true }]} />
      <details className="small" style={{ marginTop: 6 }}>
        <summary className="muted">Ver datos del AGP</summary>
        <DataTable head={["Hora", "n", "P5", "P25", "Mediana", "P75", "P95"]} rows={valid.filter((_, i) => i % 2 === 0).map((b) => [hh(b.minute), b.n, v(b.p5!), v(b.p25!), v(b.p50!), v(b.p75!), v(b.p95!)])} />
      </details>
    </figure>
  );
}

export interface DayEvent {
  ts: number;
  end?: number;
  kind: "meal" | "exercise" | "insulin" | "note" | "other";
  label: string;
}

const EVENT_META: Record<DayEvent["kind"], { color: string; shape: "tri" | "rect" | "dia" | "dot"; name: string }> = {
  meal: { color: "var(--chart-3)", shape: "tri", name: "Comida" },
  exercise: { color: "var(--chart-2)", shape: "rect", name: "Actividad" },
  insulin: { color: "var(--chart-4)", shape: "dia", name: "Insulina (registro)" },
  note: { color: "var(--muted)", shape: "dot", name: "Nota/evento" },
  other: { color: "var(--muted)", shape: "dot", name: "Otro" },
};

/** Curva de un día (hora local) con rango objetivo y eventos superpuestos. */
export function GlucoseDayChart({ readings, events, dayStart, ranges, unit, height = 240 }: {
  readings: { ms: number; mgdl: number }[]; events: DayEvent[]; dayStart: number; ranges: Ranges; unit: GlucoseUnit; height?: number;
}) {
  const pad = { l: 44, r: 50, t: 22, b: 26 };
  const H = height;
  const span = 24 * 3600000;
  const yMax = Math.max(300, ...readings.map((r) => r.mgdl));
  const sx = (ms: number) => pad.l + ((ms - dayStart) / span) * (W - pad.l - pad.r);
  const sy = (v: number) => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ ms: number; mgdl: number } | null>(null);
  const id = useId();
  let d = "";
  readings.forEach((r, i) => {
    const gap = i > 0 && r.ms - readings[i - 1].ms > 45 * 60000;
    d += `${i === 0 || gap ? "M" : "L"}${sx(r.ms).toFixed(1)},${sy(r.mgdl).toFixed(1)}`;
  });
  const v = (x: number) => formatGlucose(x, unit, false);
  const kinds = [...new Set(events.map((e) => e.kind))];
  return (
    <figure style={{ margin: 0 }}>
      <div className="chartbox">
        <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={id}
          onPointerMove={(e) => {
            if (!readings.length) return;
            const rc = ref.current!.getBoundingClientRect();
            const ms = dayStart + ((((e.clientX - rc.left) / rc.width) * W - pad.l) / (W - pad.l - pad.r)) * span;
            setHover(readings.reduce((a, b) => (Math.abs(b.ms - ms) < Math.abs(a.ms - ms) ? b : a)));
          }}
          onPointerLeave={() => setHover(null)}>
          <title id={id}>Glucosa del día con comidas, actividad y eventos</title>
          <rect x={pad.l} width={W - pad.l - pad.r} y={sy(ranges.high)} height={sy(ranges.low) - sy(ranges.high)} fill="var(--g-in)" opacity={0.12} />
          {[ranges.low, ranges.high].map((y) => (
            <g key={y}>
              <line x1={pad.l} x2={W - pad.r} y1={sy(y)} y2={sy(y)} stroke="var(--g-in)" />
              <text x={W - pad.r + 4} y={sy(y) + 3}>{v(y)}</text>
            </g>
          ))}
          {[0, 6, 12, 18, 24].map((h) => <text key={h} x={sx(dayStart + h * 3600000)} y={H - 8} textAnchor="middle">{String(h).padStart(2, "0")}h</text>)}
          {events.filter((e) => e.kind === "exercise" && e.end).map((e, i) => (
            <rect key={`x${i}`} x={sx(e.ts)} width={Math.max(3, sx(e.end!) - sx(e.ts))} y={pad.t - 14} height={H - pad.b - pad.t + 14} fill="var(--chart-2)" opacity={0.12} />
          ))}
          <path d={d} fill="none" stroke="var(--text)" strokeWidth={2} strokeLinejoin="round" />
          {readings.filter((r) => r.mgdl < ranges.low || r.mgdl > ranges.veryHigh).map((r) => (
            <circle key={r.ms} cx={sx(r.ms)} cy={sy(r.mgdl)} r={3.5} fill={r.mgdl < ranges.low ? "var(--g-low)" : "var(--g-vhigh)"} stroke="var(--panel)" strokeWidth={1.5} />
          ))}
          {events.map((e, i) => {
            const m = EVENT_META[e.kind];
            const x = sx(e.ts);
            const y = pad.t - 8;
            return (
              <g key={i}>
                <title>{`${m.name}: ${e.label}`}</title>
                {m.shape === "tri" && <path d={`M${x},${y - 5} L${x + 5},${y + 4} L${x - 5},${y + 4}Z`} fill={m.color} />}
                {m.shape === "rect" && <rect x={x - 4} y={y - 4} width={8} height={8} rx={2} fill={m.color} />}
                {m.shape === "dia" && <path d={`M${x},${y - 5} L${x + 5},${y} L${x},${y + 5} L${x - 5},${y}Z`} fill={m.color} />}
                {m.shape === "dot" && <circle cx={x} cy={y} r={4} fill={m.color} />}
                <line x1={x} x2={x} y1={y + 5} y2={H - pad.b} stroke={m.color} strokeOpacity={0.35} strokeDasharray="2 3" />
              </g>
            );
          })}
          {hover && <circle cx={sx(hover.ms)} cy={sy(hover.mgdl)} r={5} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />}
        </svg>
        {hover && (
          <div className="tip" style={{ left: `${(sx(hover.ms) / W) * 100}%`, top: `${(sy(hover.mgdl) / H) * 100}%` }}>
            <div className="dim xs">{new Date(hover.ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</div>
            <b>{formatGlucose(hover.mgdl, unit)}</b>
          </div>
        )}
      </div>
      <div className="legend">
        <span><i style={{ background: "var(--text)" }} />Glucosa (importada)</span>
        {kinds.map((k) => <span key={k}><span aria-hidden style={{ color: EVENT_META[k].color }}>{EVENT_META[k].shape === "tri" ? "▲" : EVENT_META[k].shape === "rect" ? "■" : EVENT_META[k].shape === "dia" ? "◆" : "●"}</span>{EVENT_META[k].name}</span>)}
      </div>
      {events.length > 0 && (
        <ul className="small muted" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {events.map((e, i) => <li key={i}>{new Date(e.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} · {EVENT_META[e.kind].name}: {e.label}</li>)}
        </ul>
      )}
    </figure>
  );
}

export const glucoseIn = (mgdl: number, unit: GlucoseUnit) => fromMgdl(mgdl, unit);
