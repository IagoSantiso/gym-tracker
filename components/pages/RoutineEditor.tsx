"use client";
/** Constructor de rutinas: días, ejercicios, series, rango de reps, RIR, descanso, tempo y notas. Reordenar con arrastrar o flechas. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, Field, Icon, Modal, NumInput, PageHead, useToast } from "@/components/ui";
import { tbl } from "@/lib/db/db";
import { put } from "@/lib/db/repo";
import { EQUIPMENT_LABEL, LIBRARY, findExercise } from "@/lib/domain/training/library";
import type { TemplateDay, TemplateItem, WorkoutTemplate } from "@/lib/db/types";

const blankDay = (n: number): TemplateDay => ({ title: `Día ${n}`, subtitle: "", focus: "custom", items: [] });

export function RoutineEditor() {
  const toast = useToast();
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState("Mi rutina");
  const [kind, setKind] = useState<WorkoutTemplate["kind"]>("custom");
  const [days, setDays] = useState<TemplateDay[]>([blankDay(1)]);
  const [picker, setPicker] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ d: number; i: number } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("id");
    if (!q) return;
    void tbl("workout_templates").get(q).then((t) => {
      if (!t) return;
      setId(t.source === "seed" ? null : t.id);
      setName(t.source === "seed" ? `${t.name} (mi versión)` : t.name);
      setKind(t.kind);
      setDays(structuredClone(t.days));
    });
  }, []);
  const upd = (d: number, f: (day: TemplateDay) => TemplateDay) => setDays((ds) => ds.map((x, i) => (i === d ? f(x) : x)));
  const updItem = (d: number, i: number, ch: Partial<TemplateItem>) => upd(d, (day) => ({ ...day, items: day.items.map((it, k) => (k === i ? { ...it, ...ch } : it)) }));
  const move = (d: number, from: number, to: number) => upd(d, (day) => {
    const items = [...day.items];
    const [x] = items.splice(from, 1);
    items.splice(Math.max(0, Math.min(items.length, to)), 0, x);
    return { ...day, items };
  });
  const save = async () => {
    const clean = days.map((d) => ({ ...d, items: d.items.map((it) => ({ ...it, repsMax: Math.max(it.repsMin, it.repsMax) })) }));
    const saved = await put("workout_templates", { ...(id ? { id } : {}), name: name.trim() || "Mi rutina", kind, days: clean, source: "manual", description: null });
    setId(saved.id);
    toast("Rutina guardada");
  };
  return (
    <>
      <PageHead eyebrow="Constructor de rutinas" title={name || "Rutina"} actions={<><Link className="btn ghost" href="/entrenamiento?tab=rutinas">Volver</Link><button className="btn primary" onClick={() => void save()}>Guardar</button></>} />
      <Card>
        <div className="grid g2">
          <Field label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Tipo">
            <select value={kind} onChange={(e) => setKind(e.target.value as WorkoutTemplate["kind"])}>
              <option value="full_body">Full body</option><option value="upper_lower">Torso/pierna</option><option value="ppl">Empuje/tracción/pierna</option><option value="custom">Personalizada</option>
            </select>
          </Field>
        </div>
      </Card>
      {days.map((day, d) => (
        <Card key={d} className="" title={<input className="input" value={day.title} aria-label="Título del día" onChange={(e) => upd(d, (x) => ({ ...x, title: e.target.value }))} />}
          right={<button className="icon-btn" aria-label="Quitar día" onClick={() => setDays((ds) => ds.filter((_, i) => i !== d))}><Icon name="trash" /></button>}>
          <div className="grid g2" style={{ marginBottom: 10 }}>
            <Field label="Subtítulo"><input value={day.subtitle} onChange={(e) => upd(d, (x) => ({ ...x, subtitle: e.target.value }))} placeholder="Pecho · hombro · tríceps" /></Field>
            <Field label="Enfoque (para el planificador)">
              <select value={day.focus} onChange={(e) => upd(d, (x) => ({ ...x, focus: e.target.value as TemplateDay["focus"] }))}>
                <option value="push">Empuje</option><option value="pull">Tracción</option><option value="legs">Piernas</option><option value="upper">Torso</option><option value="lower">Pierna</option><option value="full">Cuerpo completo</option><option value="custom">Otro</option>
              </select>
            </Field>
          </div>
          <div className="stack">
            {day.items.map((it, i) => {
              const ex = findExercise(it.exerciseId);
              return (
                <div key={i} className="card tight" draggable onDragStart={() => setDrag({ d, i })} onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (drag && drag.d === d) move(d, drag.i, i); setDrag(null); }} style={{ background: "var(--panel2)" }}>
                  <div className="row between">
                    <div className="row" style={{ gap: 6 }}><span aria-hidden style={{ cursor: "grab", color: "var(--dim)" }}><Icon name="grip" size={18} /></span><b>{i + 1}. {ex?.name ?? it.exerciseId}</b></div>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="icon-btn" aria-label="Subir" disabled={i === 0} onClick={() => move(d, i, i - 1)}><Icon name="up" /></button>
                      <button className="icon-btn" aria-label="Bajar" disabled={i === day.items.length - 1} onClick={() => move(d, i, i + 1)}><Icon name="down" /></button>
                      <button className="icon-btn" aria-label="Quitar ejercicio" onClick={() => upd(d, (x) => ({ ...x, items: x.items.filter((_, k) => k !== i) }))}><Icon name="x" /></button>
                    </div>
                  </div>
                  <div className="grid g4" style={{ marginTop: 8 }}>
                    <Field label="Series"><NumInput value={it.sets} inputMode="numeric" min={1} max={10} ariaLabel="Series" onChange={(n) => updItem(d, i, { sets: n ?? 1 })} /></Field>
                    <Field label="Reps mín."><NumInput value={it.repsMin} inputMode="numeric" min={1} max={50} ariaLabel="Repeticiones mínimas" onChange={(n) => updItem(d, i, { repsMin: n ?? 1 })} /></Field>
                    <Field label="Reps máx."><NumInput value={it.repsMax} inputMode="numeric" min={1} max={50} ariaLabel="Repeticiones máximas" onChange={(n) => updItem(d, i, { repsMax: n ?? 1 })} /></Field>
                    <Field label="RIR"><NumInput value={it.rir} inputMode="numeric" min={0} max={5} ariaLabel="RIR" onChange={(n) => updItem(d, i, { rir: n ?? 2 })} /></Field>
                    <Field label="Descanso (s)"><NumInput value={it.restSec} inputMode="numeric" min={0} max={600} ariaLabel="Descanso" onChange={(n) => updItem(d, i, { restSec: n ?? 60 })} /></Field>
                    <Field label="Tempo"><input value={it.tempo ?? ""} placeholder="3-1-1-0" onChange={(e) => updItem(d, i, { tempo: e.target.value || null })} /></Field>
                    <Field label="Notas"><input value={it.notes ?? ""} onChange={(e) => updItem(d, i, { notes: e.target.value || null })} /></Field>
                  </div>
                </div>
              );
            })}
            <button className="btn sm" onClick={() => setPicker(d)}><Icon name="plus" />Añadir ejercicio</button>
          </div>
        </Card>
      ))}
      <div className="actions">
        <button className="btn" onClick={() => setDays((ds) => [...ds, blankDay(ds.length + 1)])}><Icon name="plus" />Añadir día</button>
        <button className="btn primary" onClick={() => void save()}>Guardar rutina</button>
      </div>
      <Picker open={picker != null} onClose={() => setPicker(null)} onPick={(exId) => {
        const ex = findExercise(exId)!;
        upd(picker!, (x) => ({ ...x, items: [...x.items, { exerciseId: exId, sets: 3, repsMin: ex.category === "isolation" ? 10 : 8, repsMax: ex.category === "isolation" ? 15 : 12, rir: 2, restSec: ex.restSec || 60, tempo: null, notes: null, repsLabel: null }] }));
        setPicker(null);
      }} />
    </>
  );
}

function Picker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const list = LIBRARY.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()) || e.group.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open={open} onClose={onClose} title="Elegir ejercicio">
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o grupo" aria-label="Buscar ejercicio" />
      <div className="list" style={{ marginTop: 8 }}>
        {list.map((e) => (
          <button key={e.id} className="li" style={{ width: "100%", textAlign: "left" }} onClick={() => onPick(e.id)}>
            <div className="grow"><div className="t">{e.name}</div><div className="s">{e.group} · {e.equipment.map((x) => EQUIPMENT_LABEL[x]).join(", ")}</div></div>
            <Icon name="plus" />
          </button>
        ))}
      </div>
    </Modal>
  );
}
