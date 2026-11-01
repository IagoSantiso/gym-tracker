"use client";
/**
 * Tarjeta de ejercicio (diseño original) con registro serie a serie.
 * La sugerencia de progresión se muestra como "Hoy: X kg" y solo se aplica al pulsar "Aplicar"
 * (o automáticamente si el usuario lo activó en Ajustes).
 */
import { memo, useEffect, useState } from "react";
import { BodyMap } from "./BodyMap";
import { Icon } from "@/components/ui/Icon";
import type { LibraryExercise } from "@/lib/domain/training/library";
import type { Suggestion } from "@/lib/domain/training/progression";
import { estimate1RM } from "@/lib/domain/training/progression";
import type { ExerciseSet, TemplateItem } from "@/lib/db/types";

type Phase = "play" | "a" | "b";

export interface SetDraft {
  id?: string;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  completed: boolean;
}

interface Props {
  index: number;
  item: TemplateItem;
  ex: LibraryExercise;
  sets: number;
  rirTarget: number;
  logged: ExerciseSet[];
  last?: { date: string; sets: ExerciseSet[] };
  suggestion: Suggestion;
  autoApply: boolean;
  plateau?: string | null;
  onSaveSet: (setIndex: number, d: SetDraft) => void;
  onSwap: () => void;
}

const fmtKg = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
const parse = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};

function ExerciseCardImpl({ index, item, ex, sets, rirTarget, logged, last, suggestion, autoApply, plateau, onSaveSet, onSwap }: Props) {
  const [phase, setPhase] = useState<Phase>("play");
  const lastSets = last?.sets.filter((s) => s.completed && !s.isWarmup) ?? [];
  const baseWeight = autoApply && suggestion.weightKg != null ? suggestion.weightKg : suggestion.lastWeightKg;
  const initial = (j: number): SetDraft => {
    const l = logged.find((s) => s.setIndex === j);
    if (l) return { id: l.id, weightKg: l.weightKg ?? null, reps: l.reps ?? null, rir: l.rir ?? null, completed: l.completed };
    return { weightKg: baseWeight ?? null, reps: lastSets[j]?.reps ?? lastSets.at(-1)?.reps ?? item.repsMax, rir: rirTarget, completed: false };
  };
  const [drafts, setDrafts] = useState<SetDraft[]>(() => Array.from({ length: sets }, (_, j) => initial(j)));
  const [txt, setTxt] = useState(() => drafts.map((d) => ({ w: fmtKg(d.weightKg), r: d.reps == null ? "" : String(d.reps) })));

  useEffect(() => {
    // nº de series cambia (adaptación/descarga) o llegan registros guardados
    setDrafts((prev) => Array.from({ length: sets }, (_, j) => {
      const l = logged.find((s) => s.setIndex === j);
      if (l) return { id: l.id, weightKg: l.weightKg ?? null, reps: l.reps ?? null, rir: l.rir ?? null, completed: l.completed };
      return prev[j] ?? initial(j);
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets, logged]);
  useEffect(() => {
    setTxt(drafts.map((d) => ({ w: fmtKg(d.weightKg), r: d.reps == null ? "" : String(d.reps) })));
  }, [drafts]);

  const done = drafts.filter((d) => d.completed).length;
  const complete = done >= sets;
  const applySuggestion = () => {
    if (suggestion.weightKg == null) return;
    setDrafts((ds) => ds.map((d) => (d.completed ? d : { ...d, weightKg: suggestion.weightKg })));
  };
  const toggle = (j: number) => {
    const t = txt[j];
    const d: SetDraft = { ...drafts[j], weightKg: parse(t.w), reps: parse(t.r), completed: !drafts[j].completed };
    setDrafts((ds) => ds.map((x, i) => (i === j ? d : x)));
    onSaveSet(j, d);
  };
  const markAll = () => drafts.forEach((d, j) => !d.completed && toggle(j));
  const best1rm = drafts.filter((d) => d.completed && d.weightKg && d.reps).map((d) => estimate1RM(d.weightKg!, d.reps!, d.rir ?? 0) ?? 0).reduce((a, b) => Math.max(a, b), 0);

  return (
    <article className={`ex ${complete ? "done" : ""}`} aria-label={ex.name}>
      <div className="ex-grid">
        {ex.photos ? (
          <div className={`media ${phase === "play" ? "play" : `show-${phase}`}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="a" src={`/exercises/${ex.id}-0.jpg`} alt={`${ex.name}: posición inicial`} loading="lazy" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="b" src={`/exercises/${ex.id}-1.jpg`} alt={`${ex.name}: posición final`} loading="lazy" />
            <span className="idx">{String(index + 1).padStart(2, "0")}</span>
            <button className="check" aria-label="Marcar todas las series" onClick={markAll}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </button>
            <div className="phase">
              <button className={phase === "a" ? "on" : ""} onClick={() => setPhase("a")}>Inicio</button>
              <button className={phase === "b" ? "on" : ""} onClick={() => setPhase("b")}>Final</button>
              <button className={phase === "play" ? "on" : ""} onClick={() => setPhase("play")}>▶ Auto</button>
            </div>
          </div>
        ) : (
          <div className="media nophoto" aria-label="Sin foto fiable: se muestra el mapa muscular">
            <span className="idx">{String(index + 1).padStart(2, "0")}</span>
            <BodyMap primary={ex.primary} secondary={ex.secondary} />
          </div>
        )}
        <div className="info">
          <div className="row between">
            <div className="grp">{ex.group}</div>
            <button className="btn sm ghost" onClick={onSwap} aria-label={`Cambiar ${ex.name}`}><Icon name="swap" />Cambiar</button>
          </div>
          <h3>{ex.name}</h3>
          <div className="rx">
            <span><b>{sets}</b> series</span>
            <span><b>{item.repsLabel ?? `${item.repsMin}–${item.repsMax}`}</b> reps</span>
            <span><b>RIR {rirTarget}</b></span>
            <span><b>{item.restSec}s</b> descanso</span>
            {item.tempo && <span>tempo <b>{item.tempo}</b></span>}
          </div>
          <div className="anat">
            <BodyMap primary={ex.primary} secondary={ex.secondary} />
            <div className="mus">
              <div className="k"><i style={{ background: "var(--lime)" }} />Principal</div>
              <p>{ex.main}</p>
              {ex.sec !== "—" && (<><div className="k"><i style={{ background: "rgba(197,243,107,.42)" }} />Secundario</div><p>{ex.sec}</p></>)}
            </div>
          </div>
          <ul className="cues">{ex.cues.map((c) => <li key={c}>{c}</li>)}</ul>
          {ex.errors.length > 0 && <div className="xs dim">Errores frecuentes: {ex.errors.join(" · ")}</div>}
          {ex.caution && <div className="xs" style={{ color: "var(--amber)" }}>Precaución general: {ex.caution}</div>}
          {item.notes && <div className="xs muted">Nota: {item.notes}</div>}
        </div>
      </div>
      <div className="log" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div className="suggest" role="note">
          {suggestion.action === "start" ? (
            <span>{suggestion.reason}</span>
          ) : (
            <>
              <span>Hoy: <b>{suggestion.weightKg != null ? `${fmtKg(suggestion.weightKg)} kg` : "mismo nivel"}</b></span>
              <span className="muted">{suggestion.reason}</span>
              {suggestion.action === "increase" && suggestion.weightKg != null && !autoApply && (
                <button className="btn sm primary" onClick={applySuggestion}>Aplicar</button>
              )}
            </>
          )}
        </div>
        <div className="setrows">
          <div className="sethead" aria-hidden><span>Serie</span><span>Kg</span><span>Reps</span><span>RIR</span><span>Hecha</span></div>
          {drafts.map((d, j) => (
            <div key={j} className={`setrow ${d.completed ? "on" : ""}`}>
              <span className="n">{j + 1}</span>
              <input inputMode="decimal" aria-label={`Peso serie ${j + 1} (kg)`} value={txt[j]?.w ?? ""} placeholder={ex.bodyweight ? "PC" : "—"}
                onChange={(e) => setTxt((t) => t.map((x, i) => (i === j ? { ...x, w: e.target.value.replace(/[^\d.,]/g, "") } : x)))}
                onBlur={() => d.completed && onSaveSet(j, { ...d, weightKg: parse(txt[j].w) })} />
              <input inputMode="numeric" aria-label={`Repeticiones serie ${j + 1}`} value={txt[j]?.r ?? ""} placeholder={String(item.repsMax)}
                onChange={(e) => setTxt((t) => t.map((x, i) => (i === j ? { ...x, r: e.target.value.replace(/[^\d]/g, "") } : x)))}
                onBlur={() => d.completed && onSaveSet(j, { ...d, reps: parse(txt[j].r) })} />
              <select aria-label={`RIR serie ${j + 1}`} value={d.rir ?? ""} onChange={(e) => {
                const rir = e.target.value === "" ? null : Number(e.target.value);
                const nd = { ...d, rir };
                setDrafts((ds) => ds.map((x, i) => (i === j ? nd : x)));
                if (d.completed) onSaveSet(j, { ...nd, weightKg: parse(txt[j].w), reps: parse(txt[j].r) });
              }}>
                <option value="">–</option>
                {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button className="done-btn" aria-pressed={d.completed} aria-label={`Serie ${j + 1} ${d.completed ? "hecha" : "pendiente"}`} onClick={() => toggle(j)}>
                <Icon name="check" />
              </button>
            </div>
          ))}
        </div>
        <div className="row between small">
          <span className="dim">
            {lastSets.length ? <>Última vez ({last!.date}): <b className="muted">{lastSets.map((s) => `${fmtKg(s.weightKg ?? 0)}×${s.reps ?? "?"}`).join(" · ")}</b></> : "Sin registro previo"}
          </span>
          {best1rm > 0 && <span className="badge src-estimated" title="Fórmula de Epley; solo orientativo">1RM est. ~{Math.round(best1rm)} kg</span>}
        </div>
        {plateau && <div className="xs" style={{ color: "var(--amber)" }}>{plateau}</div>}
      </div>
    </article>
  );
}

export const ExerciseCard = memo(ExerciseCardImpl);
