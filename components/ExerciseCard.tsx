"use client";

import { memo, useState } from "react";
import { BodyMap } from "./BodyMap";
import type { ExerciseInfo, PlanItem } from "@/lib/types";

type Phase = "play" | "a" | "b";

interface Props {
  index: number;
  item: PlanItem;
  info: ExerciseInfo;
  /** clave `${modo}-${día}-${ejercicio}` */
  k: string;
  /** nº de series efectivas (2 máx. en adaptación) */
  n: number;
  done: readonly boolean[];
  weight: string;
  reps: string;
  onToggleSet: (key: string, index: number) => void;
  onSetAll: (key: string, n: number, value: boolean) => void;
  onLoad: (key: string, field: "weight" | "reps", value: string) => void;
  onSetDone: (restSeconds: number) => void;
}

function ExerciseCardImpl({
  index, item, info, k, n, done, weight, reps, onToggleSet, onSetAll, onLoad, onSetDone,
}: Props) {
  const [phase, setPhase] = useState<Phase>("play");
  const doneCount = done.slice(0, n).filter(Boolean).length;
  const complete = doneCount >= n;
  const hasLast = weight || reps;

  return (
    <article className={`ex ${complete ? "done" : ""}`} data-k={k}>
      <div className="ex-grid">
        <div className={`media ${phase === "play" ? "play" : `show-${phase}`}`}>
          {/* <img> a propósito: next/image serviría las fotos desde /_next/image y rompería la caché offline */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="a" src={`/exercises/${item.id}-0.jpg`} alt={`${info.name}: posición inicial`} loading="lazy" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="b" src={`/exercises/${item.id}-1.jpg`} alt={`${info.name}: posición final`} loading="lazy" />
          <span className="idx">{String(index + 1).padStart(2, "0")}</span>
          <button
            className="check"
            aria-label="Marcar ejercicio completo"
            onClick={() => onSetAll(k, n, !complete)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </button>
          <div className="phase">
            <button className={phase === "a" ? "on" : ""} onClick={() => setPhase("a")}>Inicio</button>
            <button className={phase === "b" ? "on" : ""} onClick={() => setPhase("b")}>Final</button>
            <button className={phase === "play" ? "on" : ""} onClick={() => setPhase("play")}>▶ Auto</button>
          </div>
        </div>

        <div className="info">
          <div className="grp">{info.group}</div>
          <h3>{info.name}</h3>
          <div className="rx">
            <span><b>{n}</b> series</span>
            <span><b>{item.reps}</b> reps</span>
            <span><b>{item.rest}s</b> descanso</span>
          </div>
          <div className="anat">
            <BodyMap primary={info.primary} secondary={info.secondary} />
            <div className="mus">
              <div className="k"><i style={{ background: "var(--lime)" }} />Principal</div>
              <p>{info.main}</p>
              {info.sec !== "—" && (
                <>
                  <div className="k"><i style={{ background: "rgba(197,243,107,.42)" }} />Secundario</div>
                  <p>{info.sec}</p>
                </>
              )}
            </div>
          </div>
          <ul className="cues">
            {info.cues.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      </div>

      <div className="log">
        <div className="sets">
          <span className="lbl">Series</span>
          {Array.from({ length: n }, (_, j) => (
            <button
              key={j}
              className={`set ${done[j] ? "on" : ""}`}
              aria-label={`Serie ${j + 1}`}
              aria-pressed={!!done[j]}
              onClick={() => {
                onToggleSet(k, j);
                if (!done[j]) onSetDone(item.rest); // acaba de marcarse -> arranca el descanso
              }}
            >
              {j + 1}
            </button>
          ))}
        </div>
        <div className="fld">
          <label htmlFor={`w-${k}`}>Peso (kg)</label>
          <input
            id={`w-${k}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            placeholder="—"
            value={weight}
            onChange={(e) => onLoad(k, "weight", e.target.value)}
          />
        </div>
        <div className="fld wide">
          <label htmlFor={`r-${k}`}>Reps reales</label>
          <input
            id={`r-${k}`}
            type="text"
            placeholder="12/11/10"
            value={reps}
            onChange={(e) => onLoad(k, "reps", e.target.value)}
          />
        </div>
        <div className="last">
          {hasLast ? (
            <>
              Última vez:{" "}
              <b>
                {weight ? `${weight} kg` : ""}
                {weight && reps ? " · " : ""}
                {reps}
              </b>
            </>
          ) : (
            "Sin registro previo"
          )}
        </div>
      </div>
    </article>
  );
}

export const ExerciseCard = memo(ExerciseCardImpl);
