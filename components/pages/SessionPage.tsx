"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExerciseCard, type SetDraft } from "@/components/training/ExerciseCard";
import { RestDock } from "@/components/training/RestDock";
import { Icon, Modal, Notice, useToast, Field, Toggle } from "@/components/ui";
import { useLive, usePreferences } from "@/lib/db/hooks";
import { tbl } from "@/lib/db/db";
import { active, patch } from "@/lib/db/repo";
import { useRestTimer } from "@/hooks/useRestTimer";
import { useWakeLock } from "@/hooks/useWakeLock";
import { beep, unlockAudio, vibrate } from "@/lib/audio";
import { LIBRARY_BY_ID, alternativesFor, findExercise, type LibraryExercise } from "@/lib/domain/training/library";
import { adjustPrescription, detectPlateau, suggestNext, summarizeByExercise } from "@/lib/domain/training/progression";
import { discardSession, findOpenSession, finishSession, lastPerformance, startSession, upsertSet } from "@/lib/services/training";
import type { TemplateItem, WorkoutSession } from "@/lib/db/types";
import { localDate } from "@/lib/domain/time";
import { createPortal } from "react-dom";

function useQuery() {
  const [q, setQ] = useState<URLSearchParams | null>(null);
  useEffect(() => setQ(new URLSearchParams(location.search)), []);
  return q;
}

export function SessionPage() {
  const q = useQuery();
  const toast = useToast();
  const prefs = usePreferences();
  const templateId = q?.get("t") ?? prefs.activeTemplateId ?? "ppl-3d";
  const dayIndex = Number(q?.get("d") ?? 0);
  const plannedItemId = q?.get("pi") ?? null;
  const template = useLive(() => tbl("workout_templates").get(templateId), [templateId]);
  const day = template?.days[dayIndex];
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [swaps, setSwaps] = useState<Record<number, string>>({});
  const [swapFor, setSwapFor] = useState<number | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [rpe, setRpe] = useState<number | null>(7);
  const [notes, setNotes] = useState("");
  const [deload, setDeload] = useState(false);

  useEffect(() => {
    if (!template) return;
    void findOpenSession(templateId, dayIndex).then((s) => {
      if (s) {
        setSession(s);
        setDeload(s.deload);
        try { setSwaps(JSON.parse(localStorage.getItem(`swaps:${s.id}`) ?? "{}")); } catch { /* */ }
      } else setDeload(prefs.deloadActiveWeek != null && prefs.deloadActiveWeek <= localDate());
    });
  }, [template, templateId, dayIndex, prefs.deloadActiveWeek]);

  const items: (TemplateItem & { ex: LibraryExercise })[] = useMemo(
    () => (day?.items ?? []).map((it, i) => {
      const id = swaps[i] ?? it.exerciseId;
      return { ...it, exerciseId: id, ex: findExercise(id) ?? LIBRARY_BY_ID.bench };
    }),
    [day, swaps],
  );
  const exIds = items.map((i) => i.exerciseId).join(",");
  const last = useLive(() => lastPerformance(exIds.split(",").filter(Boolean), session?.id), [exIds, session?.id]) ?? {};
  const logged = useLive(async () => (session ? (await tbl("exercise_sets").where("sessionId").equals(session.id).toArray()).filter(active) : []), [session?.id]) ?? [];
  const history = useLive(async () => {
    const ids = exIds.split(",").filter(Boolean);
    const sessions = (await tbl("workout_sessions").toArray()).filter((s) => active(s) && s.status === "completed");
    const dates = Object.fromEntries(sessions.map((s) => [s.id, s.date]));
    const sets = (await tbl("exercise_sets").where("exerciseId").anyOf(ids).toArray()).filter(active);
    return summarizeByExercise(sets, dates);
  }, [exIds]) ?? {};

  /* temporizador y pantalla */
  const timer = useRestTimer(useCallback(({ late }: { late: boolean }) => {
    if (late) { vibrate(); toast("Descanso terminado"); } else { beep(); toast("¡A por la siguiente serie!"); }
  }, [toast]));
  const screenOn = useWakeLock(!!session || timer.running);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById("wake-slot")), []);

  const ensureSession = async () => {
    if (session) return session;
    const s = await startSession({ templateId, dayIndex, title: day?.title ?? "Sesión", plannedItemId, deload, adaptation: prefs.adaptationMode });
    setSession(s);
    return s;
  };

  const saveSet = (order: number, item: TemplateItem, setIndex: number, d: SetDraft) => {
    void (async () => {
      const s = await ensureSession();
      await upsertSet({
        id: d.id ?? `${s.id}:${order}:${setIndex}`, sessionId: s.id, exerciseId: item.exerciseId, exerciseOrder: order, setIndex,
        weightKg: d.weightKg, reps: d.reps, rir: d.rir, completed: d.completed, completedAt: d.completed ? new Date().toISOString() : null,
        isWarmup: false, targetRepsMin: item.repsMin, targetRepsMax: item.repsMax, notes: null,
      });
      if (d.completed) {
        unlockAudio();
        timer.start(item.restSec);
      }
    })();
  };

  const totalSets = items.reduce((a, it) => a + adjustPrescription(it.sets, it.rir, { deload, adaptation: prefs.adaptationMode }).sets, 0);
  const doneSets = logged.filter((s) => s.completed).length;

  if (!q || template === undefined) return <div className="empty-state">Cargando sesión…</div>;
  if (!template || !day) return <Notice kind="warn">No se encontró la rutina. <Link href="/entrenamiento">Volver</Link></Notice>;

  return (
    <>
      {slot && screenOn && createPortal(<span className="wl" title="La pantalla no se apagará durante la sesión"><i />Pantalla activa</span>, slot)}
      <div className="session-top" style={{ paddingTop: 18 }}>
        <div>
          <Link href="/entrenamiento" className="btn sm ghost no-print" style={{ marginBottom: 8 }}><Icon name="left" />Entrenamiento</Link>
          <div className="eyebrow">{template.name} · día {dayIndex + 1}</div>
          <h2>{day.title}</h2>
          <div className="sub">{day.subtitle} · {items.length} ejercicios</div>
        </div>
        <div className="stack" style={{ minWidth: 240 }}>
          <label className="switch">
            <input type="checkbox" checked={prefs.adaptationMode} onChange={(e) => void patch("preferences", "me", { adaptationMode: e.target.checked })} />
            <span>Adaptación: 2 series<br /><span style={{ color: "var(--dim)", fontSize: 11 }}>primeras 2 semanas</span></span>
          </label>
          <label className="switch">
            <input type="checkbox" checked={deload} onChange={(e) => { setDeload(e.target.checked); if (session) void patch("workout_sessions", session.id, { deload: e.target.checked }); }} />
            <span>Descarga<br /><span style={{ color: "var(--dim)", fontSize: 11 }}>½ series, −10 % carga, +2 RIR</span></span>
          </label>
        </div>
      </div>
      <div className="prog">
        <div className="track"><i style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }} /></div>
        <span>{doneSets}/{totalSets} series</span>
      </div>
      {items.map((it, i) => {
        const adj = adjustPrescription(it.sets, it.rir, { deload, adaptation: prefs.adaptationMode });
        const lp = last[it.exerciseId];
        let sug = suggestNext(lp?.sets ?? [], { repsMin: it.repsMin, repsMax: it.repsMax, rir: it.rir }, it.ex.incrementKg);
        if (deload && sug.lastWeightKg != null) sug = { ...sug, action: "hold", weightKg: Math.round(sug.lastWeightKg * adj.loadFactor * 2) / 2, reason: "Semana de descarga: ~10 % menos de carga y más recámara." };
        const pl = detectPlateau(history[it.exerciseId] ?? []);
        return (
          <ExerciseCard
            key={`${i}-${it.exerciseId}`}
            index={i} item={it} ex={it.ex} sets={adj.sets} rirTarget={adj.rir}
            logged={logged.filter((s) => s.exerciseOrder === i && s.exerciseId === it.exerciseId)}
            last={lp} suggestion={sug} autoApply={prefs.autoApplyProgression && !deload}
            plateau={pl.plateau ? `Posible estancamiento (orientativo): ${pl.detail}` : null}
            onSaveSet={(j, d) => saveSet(i, it, j, d)}
            onSwap={() => setSwapFor(i)}
          />
        );
      })}
      <div className="actions">
        <button className="btn primary" onClick={() => (doneSets ? setFinishOpen(true) : toast("Marca al menos una serie"))}>Guardar sesión</button>
        {session && (
          <button className="btn ghost" onClick={() => { if (confirm("¿Descartar la sesión y sus series?")) void discardSession(session.id).then(() => { setSession(null); toast("Sesión descartada"); }); }}>
            Descartar
          </button>
        )}
      </div>
      <SwapModal index={swapFor} items={items} onClose={() => setSwapFor(null)} onPick={(i, id) => {
        const next = { ...swaps, [i]: id };
        setSwaps(next);
        if (session) localStorage.setItem(`swaps:${session.id}`, JSON.stringify(next));
        setSwapFor(null);
      }} />
      <Modal open={finishOpen} onClose={() => setFinishOpen(false)} title="Terminar sesión" footer={
        <>
          <button className="btn ghost" onClick={() => setFinishOpen(false)}>Seguir</button>
          <button className="btn primary" onClick={async () => {
            if (!session) return;
            await finishSession(session.id, { rpe, notes: notes.trim() || null });
            setFinishOpen(false);
            setSession(null);
            toast("Sesión guardada 💪");
            location.href = "/entrenamiento?tab=historial";
          }}>Guardar</button>
        </>
      }>
        <div className="stack">
          <Field label={`Esfuerzo percibido de la sesión (RPE): ${rpe ?? "—"}/10`} hint="Se usa para la carga interna aproximada (duración × RPE).">
            <input type="range" min={1} max={10} value={rpe ?? 7} onChange={(e) => setRpe(Number(e.target.value))} />
          </Field>
          <Field label="Notas (opcional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sensaciones, molestias, cambios de máquina…" />
          </Field>
          <p className="small muted">{doneSets} series registradas.</p>
        </div>
      </Modal>
      <RestDock base={timer.base} secs={timer.secs} running={timer.running} paused={timer.paused} flash={timer.flash}
        onToggle={() => { unlockAudio(); timer.toggle(); }} onAdjust={timer.adjust} onReset={timer.reset} />
    </>
  );
}

function SwapModal({ index, items, onClose, onPick }: { index: number | null; items: (TemplateItem & { ex: LibraryExercise })[]; onClose: () => void; onPick: (i: number, id: string) => void }) {
  const [reason, setReason] = useState<"busy" | "pain">("busy");
  const cur = index != null ? items[index] : null;
  const alts = cur ? alternativesFor(cur.ex.id, { max: 4, avoidEquipment: reason === "busy" ? cur.ex.equipment : [] }).filter((a) => reason === "busy" || a.difficulty <= cur.ex.difficulty) : [];
  return (
    <Modal open={index != null} onClose={onClose} title={cur ? `Cambiar: ${cur.ex.name}` : "Cambiar ejercicio"}>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="chip" aria-pressed={reason === "busy"} onClick={() => setReason("busy")}>Material ocupado</button>
        <button className="chip" aria-pressed={reason === "pain"} onClick={() => setReason("pain")}>Molestias</button>
      </div>
      {reason === "pain" && <Notice kind="warn">Si el dolor es articular, agudo o no mejora, evita el ejercicio y consulta. Se proponen variantes de menor dificultad.</Notice>}
      <div className="list" style={{ marginTop: 8 }}>
        {alts.map((a) => (
          <div className="li" key={a.id}>
            {a.photos ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/exercises/${a.id}-0.jpg`} alt="" width={64} height={44} style={{ objectFit: "cover", borderRadius: 8 }} />
            ) : <span style={{ width: 64 }} />}
            <div className="grow">
              <div className="t">{a.name}</div>
              <div className="s">{a.main} · {a.equipment.join(", ")}</div>
            </div>
            <button className="btn sm primary" onClick={() => onPick(index!, a.id)}>Usar</button>
          </div>
        ))}
        {!alts.length && <div className="empty-state">Sin alternativas con esos criterios.</div>}
      </div>
      <p className="xs dim" style={{ marginTop: 10 }}>Alternativas deterministas por músculo principal y patrón. También puedes pedir opciones al Asistente.</p>
    </Modal>
  );
}
