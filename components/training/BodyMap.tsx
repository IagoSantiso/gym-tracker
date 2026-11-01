import { MUSCLE_SHAPES, type Shape } from "@/lib/domain/training/muscles";
import type { MuscleId } from "@/lib/db/types";

const BASE = "#2a3830";

function ShapeEl({ s }: { s: Shape }) {
  switch (s.t) {
    case "path":
      return <path d={s.d} />;
    case "ellipse":
      return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} />;
    case "rect":
      return <rect x={s.x} y={s.y} width={s.width} height={s.height} rx={s.rx} />;
  }
}

function Figure({
  side, primary, secondary, dx,
}: { side: "front" | "back"; primary: MuscleId[]; secondary: MuscleId[]; dx: number }) {
  const parts = MUSCLE_SHAPES[side];
  return (
    <g transform={`translate(${dx} 0)`}>
      <circle cx="50" cy="15" r="9" fill={BASE} />
      <rect x="46" y="22" width="8" height="7" rx="2" fill={BASE} />
      <ellipse cx="21" cy="96" rx="3.5" ry="5" fill={BASE} />
      <ellipse cx="79" cy="96" rx="3.5" ry="5" fill={BASE} />
      <ellipse cx="41" cy="182" rx="5" ry="4" fill={BASE} />
      <ellipse cx="59" cy="182" rx="5" ry="4" fill={BASE} />
      {side === "front" && <rect x="40" y="86" width="20" height="10" rx="4" fill={BASE} />}
      {(Object.keys(parts) as MuscleId[]).map((k) => {
        const fill = primary.includes(k) ? "var(--lime)" : secondary.includes(k) ? "rgba(197,243,107,.42)" : "var(--body-off, #334339)";
        return (
          <g key={k} fill={fill}>
            {parts[k]!.map((s, i) => <ShapeEl key={i} s={s} />)}
          </g>
        );
      })}
      <text x="50" y="198" textAnchor="middle" fontSize="8.5" fill="#6b7a71" fontWeight="700" letterSpacing=".8">
        {side === "front" ? "FRENTE" : "ESPALDA"}
      </text>
    </g>
  );
}

export function BodyMap({ primary, secondary }: { primary: MuscleId[]; secondary: MuscleId[] }) {
  return (
    <svg viewBox="0 0 200 202" role="img" aria-label="Músculos implicados">
      <Figure side="front" primary={primary} secondary={secondary} dx={0} />
      <Figure side="back" primary={primary} secondary={secondary} dx={100} />
    </svg>
  );
}
