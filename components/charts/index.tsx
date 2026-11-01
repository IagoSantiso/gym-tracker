"use client";
/**
 * Gráficas SVG propias. Reglas: un solo eje Y, marcas finas (2 px), rejilla recesiva,
 * leyenda con ≥ 2 series, tooltip al pasar/tocar, y tabla de datos alternativa.
 * Paleta categórica validada (scripts dataviz) en tema claro y oscuro: --chart-1..4.
 */
import { useId, useMemo, useRef, useState, type ReactNode } from "react";

const W = 640;

export interface Series {
  id: string;
  label: string;
  color: string;
  points: { x: number; y: number | null }[];
  dashed?: boolean;
  dots?: boolean;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 1) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="scroll-x" style={{ maxHeight: 260, overflowY: "auto" }}>
      <table className="data">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function ChartFrame({ title, children, table, legend }: { title: string; children: ReactNode; table: ReactNode; legend?: ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure style={{ margin: 0 }}>
      {showTable ? table : children}
      <div className="row between" style={{ marginTop: 4 }}>
        <div>{legend}</div>
        <button className="btn sm ghost no-print" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
          {showTable ? "Ver gráfica" : "Ver datos"}
        </button>
      </div>
      <figcaption className="sr-only">{title}</figcaption>
    </figure>
  );
}

export function Legend({ items }: { items: { label: string; color: string; square?: boolean; dashed?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <i className={i.square ? "sq" : ""} style={{ background: i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 7px)` : i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Gráfica de líneas con eje temporal o índice. */
export function LineChart({
  title, series, height = 220, xFmt, yFmt = (v) => String(v), yUnit = "", band, refLines = [], yDomain,
}: {
  title: string; series: Series[]; height?: number; xFmt: (x: number) => string; yFmt?: (y: number) => string; yUnit?: string;
  band?: { lo: number; hi: number; label: string }; refLines?: { y: number; label: string }[]; yDomain?: [number, number];
}) {
  const pad = { l: 44, r: 14, t: 12, b: 26 };
  const H = height;
  const all = series.flatMap((s) => s.points.filter((p) => p.y != null)) as { x: number; y: number }[];
  const xs = all.map((p) => p.x);
  const ys = [...all.map((p) => p.y), ...(band ? [band.lo, band.hi] : []), ...refLines.map((r) => r.y)];
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const yPad = (Math.max(...ys) - Math.min(...ys)) * 0.08 || 1;
  const [y0, y1] = yDomain ?? [Math.min(...ys) - yPad, Math.max(...ys) + yPad];
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b);
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const uniqX = useMemo(() => [...new Set(xs)].sort((a, b) => a - b), [xs.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const id = useId();
  if (!all.length) return <div className="empty-state">Sin datos suficientes para la gráfica.</div>;
  const yt = niceTicks(y0, y1);
  const xt = uniqX.length <= 6 ? uniqX : [0, 0.33, 0.66, 1].map((f) => uniqX[Math.round(f * (uniqX.length - 1))]);
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = uniqX[0];
    for (const u of uniqX) if (Math.abs(sx(u) - x) < Math.abs(sx(best) - x)) best = u;
    setHover(best);
  };
  const path = (s: Series) => {
    let d = "";
    let pen = false;
    for (const p of s.points) {
      if (p.y == null) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const hx = hover != null ? sx(hover) : 0;
  const tipRows = hover != null ? series.map((s) => ({ s, p: s.points.find((p) => p.x === hover) })).filter((r) => r.p && r.p.y != null) : [];
  return (
    <ChartFrame
      title={title}
      legend={series.length > 1 ? <Legend items={series.map((s) => ({ label: s.label, color: s.color, dashed: s.dashed }))} /> : undefined}
      table={<DataTable head={["Fecha", ...series.map((s) => `${s.label}${yUnit ? ` (${yUnit})` : ""}`)]} rows={uniqX.map((x) => [xFmt(x), ...series.map((s) => { const p = s.points.find((q) => q.x === x); return p?.y != null ? yFmt(p.y) : "—"; })])} />}
    >
      <div className="chartbox">
        <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={id}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)} onPointerDown={onMove}>
          <title id={id}>{title}</title>
          {band && <rect x={pad.l} width={W - pad.l - pad.r} y={sy(band.hi)} height={Math.max(0, sy(band.lo) - sy(band.hi))} fill="var(--band)" />}
          {yt.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={pad.l - 6} y={sy(t) + 3} textAnchor="end">{yFmt(t)}</text>
            </g>
          ))}
          {refLines.map((r) => (
            <g key={r.label}>
              <line x1={pad.l} x2={W - pad.r} y1={sy(r.y)} y2={sy(r.y)} stroke="var(--dim)" strokeDasharray="4 4" strokeWidth={1} />
              <text x={W - pad.r} y={sy(r.y) - 4} textAnchor="end">{r.label}</text>
            </g>
          ))}
          {xt.map((x) => <text key={x} x={sx(x)} y={H - 8} textAnchor="middle">{xFmt(x)}</text>)}
          {series.map((s) => (
            <g key={s.id}>
              <path d={path(s)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
              {s.dots && s.points.filter((p) => p.y != null).map((p) => <circle key={p.x} cx={sx(p.x)} cy={sy(p.y!)} r={3} fill={s.color} stroke="var(--panel)" strokeWidth={2} />)}
            </g>
          ))}
          {hover != null && (
            <g>
              <line x1={hx} x2={hx} y1={pad.t} y2={H - pad.b} stroke="var(--line2)" />
              {tipRows.map(({ s, p }) => <circle key={s.id} cx={hx} cy={sy(p!.y!)} r={4.5} fill={s.color} stroke="var(--panel)" strokeWidth={2} />)}
            </g>
          )}
        </svg>
        {hover != null && tipRows.length > 0 && (
          <div className="tip" style={{ left: `${(hx / W) * 100}%`, top: `${(sy(tipRows[0].p!.y!) / H) * 100}%` }}>
            <div className="dim xs">{xFmt(hover)}</div>
            {tipRows.map(({ s, p }) => <div key={s.id}><span style={{ color: s.color }}>●</span> {s.label}: <b>{yFmt(p!.y!)}{yUnit && ` ${yUnit}`}</b></div>)}
          </div>
        )}
      </div>
    </ChartFrame>
  );
}

/** Barras verticales (una serie) con tooltip por barra. */
export function BarChart({ title, data, height = 200, yFmt = (v) => String(v), unit = "", color = "var(--chart-1)" }: {
  title: string; data: { label: string; value: number; note?: string }[]; height?: number; yFmt?: (v: number) => string; unit?: string; color?: string;
}) {
  const pad = { l: 40, r: 10, t: 14, b: 28 };
  const H = height;
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = niceTicks(0, max, 4);
  const top = Math.max(max, ticks.at(-1) ?? max);
  const bw = (W - pad.l - pad.r) / Math.max(1, data.length);
  const sy = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  if (!data.length) return <div className="empty-state">Sin datos.</div>;
  const maxIdx = data.reduce((a, d, i) => (d.value > data[a].value ? i : a), 0);
  return (
    <ChartFrame title={title} table={<DataTable head={["", unit || "valor"]} rows={data.map((d) => [d.label, yFmt(d.value)])} />}>
      <div className="chartbox">
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={id} onPointerLeave={() => setHover(null)}>
          <title id={id}>{title}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--chart-grid)" />
              <text x={pad.l - 6} y={sy(t) + 3} textAnchor="end">{yFmt(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.l + i * bw + 2;
            const w = Math.max(2, bw - 4);
            const y = sy(d.value);
            const h = Math.max(0, H - pad.b - y);
            const r = Math.min(4, w / 2, h);
            return (
              <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
                <rect x={x - 2} y={pad.t} width={w + 4} height={H - pad.t - pad.b} fill="transparent" />
                {h > 0 && <path d={`M${x},${H - pad.b} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${H - pad.b} Z`} fill={color} opacity={hover == null || hover === i ? 1 : 0.55} />}
                {(i === maxIdx || data.length <= 8) && d.value > 0 && <text x={x + w / 2} y={y - 4} textAnchor="middle" style={{ fill: "var(--muted)" }}>{yFmt(d.value)}</text>}
                <text x={x + w / 2} y={H - 9} textAnchor="middle">{d.label}</text>
              </g>
            );
          })}
        </svg>
        {hover != null && (
          <div className="tip" style={{ left: `${((pad.l + hover * bw + bw / 2) / W) * 100}%`, top: `${(sy(data[hover].value) / H) * 100}%` }}>
            <div className="dim xs">{data[hover].label}</div>
            <b>{yFmt(data[hover].value)} {unit}</b>
            {data[hover].note && <div className="xs muted">{data[hover].note}</div>}
          </div>
        )}
      </div>
    </ChartFrame>
  );
}

export { DataTable };
