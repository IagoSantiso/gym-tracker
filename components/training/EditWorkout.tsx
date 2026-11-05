"use client";
import { useState } from "react";
import {
  ActionButton,
  Field,
  Modal,
  NumInput,
  useToast,
} from "@/components/ui";
import { useLive } from "@/lib/db/hooks";
import { active, patch } from "@/lib/db/repo";
import { getDb, tbl } from "@/lib/db/db";
import type {
  EnduranceSession,
  ExerciseSet,
  WorkoutSession,
} from "@/lib/db/types";
import { findExercise } from "@/lib/domain/training/library";
import { editWorkout } from "@/lib/services/training";

export function EditWorkoutModal({
  session,
  onClose,
}: {
  session: WorkoutSession;
  onClose: () => void;
}) {
  const sets = useLive(
    async () =>
      (
        await tbl("exercise_sets")
          .where("sessionId")
          .equals(session.id)
          .toArray()
      )
        .filter(active)
        .sort(
          (a, b) =>
            a.exerciseOrder - b.exerciseOrder || a.setIndex - b.setIndex,
        ),
    [session.id],
  );
  return sets ? (
    <WorkoutForm session={session} initial={sets} onClose={onClose} />
  ) : (
    <Modal open title="Cargando sesión" onClose={onClose}>
      <p>Cargando series…</p>
    </Modal>
  );
}
function WorkoutForm({
  session,
  initial,
  onClose,
}: {
  session: WorkoutSession;
  initial: ExerciseSet[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState(session.title),
    [minutes, setMinutes] = useState<number | null>(
      session.durationMin ?? null,
    ),
    [sets, setSets] = useState(initial);
  const toast = useToast();
  const change = (id: string, v: Partial<ExerciseSet>) =>
    setSets((xs) => xs.map((s) => (s.id === id ? { ...s, ...v } : s)));
  return (
    <Modal
      open
      title="Corregir sesión"
      onClose={onClose}
      footer={
        <ActionButton
          className="btn primary"
          onRun={async () => {
            await editWorkout(session.id, {
              title,
              durationMin: minutes,
              sets,
            });
            toast("Sesión actualizada");
            onClose();
          }}
        >
          Guardar cambios
        </ActionButton>
      }
    >
      <div className="stack">
        <Field label="Nombre">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Duración total (min)">
          <NumInput value={minutes} onChange={setMinutes} />
        </Field>
        {sets.map((s) => (
          <div key={s.id} className="card">
            <b>
              {findExercise(s.exerciseId)?.name} · serie {s.setIndex + 1}
            </b>
            <div className="grid g2">
              <Field label="Carga (kg)">
                <NumInput
                  value={s.weightKg ?? null}
                  onChange={(v) => change(s.id, { weightKg: v })}
                />
              </Field>
              {s.durationSec != null ? (
                <Field label="Segundos">
                  <NumInput
                    value={s.durationSec}
                    onChange={(v) => change(s.id, { durationSec: v })}
                  />
                </Field>
              ) : (
                <Field label="Repeticiones">
                  <NumInput
                    value={s.reps ?? null}
                    onChange={(v) => change(s.id, { reps: v })}
                  />
                </Field>
              )}
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={s.completed}
                onChange={(e) => change(s.id, { completed: e.target.checked })}
              />
              Serie realizada
            </label>
          </div>
        ))}
        <p className="xs dim">
          La sesión mantiene su estado. Corregir una serie no borra la
          confirmación de que entrenaste.
        </p>
      </div>
    </Modal>
  );
}
export function EditEnduranceModal({
  session,
  onClose,
}: {
  session: EnduranceSession;
  onClose: () => void;
}) {
  const [minutes, setMinutes] = useState<number | null>(
      session.durationSec / 60,
    ),
    [km, setKm] = useState<number | null>(
      session.distanceM == null ? null : session.distanceM / 1000,
    ),
    [notes, setNotes] = useState(session.notes ?? "");
  const toast = useToast();
  return (
    <Modal
      open
      title="Corregir actividad"
      onClose={onClose}
      footer={
        <ActionButton
          className="btn primary"
          disabled={
            !minutes ||
            minutes <= 0 ||
            minutes > 1440 ||
            (km != null && (km < 0 || km > 2000))
          }
          onRun={async () => {
            await patch("endurance_sessions", session.id, {
              durationSec: Math.round(minutes! * 60),
              distanceM: km == null ? null : km * 1000,
              notes,
            });
            toast("Actividad actualizada");
            onClose();
          }}
        >
          Guardar cambios
        </ActionButton>
      }
    >
      <div className="stack">
        <Field label="Duración (min)">
          <NumInput value={minutes} onChange={setMinutes} />
        </Field>
        <Field label="Distancia (km)">
          <NumInput value={km} onChange={setKm} />
        </Field>
        <Field label="Notas">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
