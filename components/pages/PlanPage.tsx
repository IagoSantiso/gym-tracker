"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ActionButton, Card, Empty, Field, Icon, Modal, Notice, NumInput, PageHead, Section, confirmAction, useToast } from "@/components/ui";
import { ProposalCard } from "@/components/plan/ProposalCard";
import { CheckinModal } from "@/components/log/QuickLog";
import { useLive, useProfile } from "@/lib/db/hooks";
import { tbl } from "@/lib/db/db";
import { active, all, patch } from "@/lib/db/repo";
import { addDays, formatDateEs, localDate, weekStartOf, WEEKDAYS_ES } from "@/lib/domain/time";
import { RULES, validateWeek } from "@/lib/domain/planning/rules";
import { proposeEaseToday, proposeReschedule, proposeShorten } from "@/lib/domain/planning/adapt";
import { createProposal, generatePlan, toggleDayLock, weekItems } from "@/lib/services/plan";
import { SPORT_LABEL, TYPE_LABEL } from "@/lib/domain/training/endurance";
import type { PlannedItem } from "@/lib/db/types";
import { formatPace } from "@/lib/domain/time";

const INT_LABEL = { rest: "Descanso", easy: "Suave", moderate: "Moderada", hard: "Dura" } as const;
const INT_SYMBOL = { rest: "○", easy: "◔", moderate: "◑", hard: "●" } as const;
const STATUS_LABEL: Record<PlannedItem["status"], string> = { planned: "Previsto", done: "Hecho", modified: "Modificado", cancelled: "Cancelado", moved: "Movido" };

export function PlanPage() {
  const p = useProfile();
  const today = localDate(Date.now(), p.timezone);
  const [ws, setWs] = useState(weekStartOf(today));
  const toast = useToast();
  const items = useLive(() => weekItems(ws), [ws]);
  const pw = useLive(async () => (await tbl("plan_weeks").where("weekStart").equals(ws).toArray()).find(active), [ws]);
  const proposals = useLive(async () => (await all("proposals")).filter((x) => x.domain === "plan").sort((a, b) => b.createdAt.localeCompare(a.createdAt)), []) ?? [];
  const actual = useLive(async () => {
    const end = addDays(ws, 6);
    const w = (await tbl("workout_sessions").where("date").between(ws, end, true, true).toArray()).filter((s) => active(s) && s.status === "completed");
    const e = (await tbl("endurance_sessions").where("date").between(ws, end, true, true).toArray()).filter(active);
    return { w, e };
  }, [ws]);
  const [editing, setEditing] = useState<PlannedItem | null>(null);
  const [checkin, setCheckin] = useState(false);
  const [shortOpen, setShortOpen] = useState(false);
  const [minutes, setMinutes] = useState<number | null>(30);
  useEffect(() => {
    if (items && !items.length && ws >= weekStartOf(today)) void generatePlan(ws);
  }, [items, ws, today]);
  const violations = useMemo(() => (items ? validateWeek(items, { weekStart: ws, availability: p.availability }) : []), [items, ws, p.availability]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const todayCheckin = useLive(() => tbl("recovery_checkins").get(`checkin-${today}`), [today]);
  const propose = async (draft: ReturnType<typeof proposeShorten>) => {
    if (!draft) return toast("No hay cambios que proponer con esos criterios");
    const r = await createProposal(draft);
    toast("error" in r ? r.error : "Propuesta creada: revísala abajo");
  };
  return (
    <>
      <PageHead eyebrow="Plan semanal" title={`Semana del ${formatDateEs(ws, { day: "numeric", month: "long" })}`}
        actions={<>
          <button className="icon-btn" aria-label="Semana anterior" onClick={() => setWs(addDays(ws, -7))}><Icon name="left" /></button>
          <button className="btn sm ghost" onClick={() => setWs(weekStartOf(today))}>Hoy</button>
          <button className="icon-btn" aria-label="Semana siguiente" onClick={() => setWs(addDays(ws, 7))}><Icon name="right" /></button>
        </>}>
        Plan generado por reglas transparentes según tu disponibilidad. Puedes bloquear días o sesiones; los cambios sugeridos requieren tu aprobación.
      </PageHead>
      <div className="row" style={{ margin: "8px 0 14px" }}>
        <ActionButton className="btn" icon="sync" busyLabel="Regenerando…" onRun={async () => { if (!confirmAction("¿Regenerar la semana? Se conservan las sesiones hechas y lo bloqueado.")) return null; const r = await generatePlan(ws); return r.notes.length ? r.notes.join(" ") : "Semana regenerada"; }} success={(m) => m}>Regenerar</ActionButton>
        {ws === weekStartOf(today) && (
          <>
            <button className="btn" onClick={() => (todayCheckin ? void propose(proposeEaseToday(items ?? [], today, todayCheckin)) : setCheckin(true))}>Me encuentro cansado</button>
            <button className="btn" onClick={() => setShortOpen(true)}>Tengo poco tiempo hoy</button>
          </>
        )}
      </div>
      {violations.length > 0 && (
        <Notice kind={violations.some((v) => v.severity === "error") ? "danger" : "warn"}>
          {violations.map((v, i) => <div key={i}><b>{v.rule}</b> · {v.message}</div>)}
        </Notice>
      )}
      {pw?.notes && <Notice kind="info">{pw.notes}</Notice>}
      <div className="stack" style={{ marginTop: 12 }}>
        {days.map((d, i) => {
          const its = (items ?? []).filter((x) => x.date === d);
          const orig = (pw?.original ?? []).filter((x) => x.date === d);
          const locked = pw?.lockedDays.includes(d);
          const realW = actual?.w.filter((x) => x.date === d) ?? [];
          const realE = actual?.e.filter((x) => x.date === d) ?? [];
          return (
            <Card key={d} className={d === today ? "" : ""} title={<span>{WEEKDAYS_ES[i]} <span className="muted small">{formatDateEs(d, { day: "numeric", month: "short" })}</span>{d === today && <span className="badge ok" style={{ marginLeft: 8 }}>Hoy</span>}</span>}
              right={<button className={`btn sm ${locked ? "primary" : "ghost"}`} onClick={() => void toggleDayLock(ws, d)} aria-pressed={!!locked} aria-label={locked ? "Desbloquear día" : "Bloquear día"}><Icon name={locked ? "lock" : "unlock"} /><span className="hide-sm">{locked ? "Bloqueado" : "Bloquear día"}</span></button>}>
              {its.length === 0 && <div className="small muted">Sin sesiones previstas.</div>}
              <div className="list">
                {its.map((it) => (
                  <div className="li plan-item" key={it.id} style={{ opacity: it.status === "cancelled" ? 0.55 : 1 }}>
                    <span className={`int int-${it.kind === "rest" ? "rest" : it.intensity}`} role="img" aria-label={`Intensidad ${INT_LABEL[it.intensity]}`} title={INT_LABEL[it.intensity]} />
                    <div className="grow">
                      <div className="t" style={{ textDecoration: it.status === "cancelled" ? "line-through" : undefined }}>{it.title}{it.locked && " 🔒"} <span className={`badge ${it.status === "done" ? "ok" : it.status === "cancelled" ? "bad" : it.status === "planned" ? "" : "warn"}`}>{STATUS_LABEL[it.status]}</span></div>
                      <div className="s">
                        {it.kind !== "rest" && `${it.durationMin} min · ${INT_LABEL[it.intensity]}`}
                        {it.runSpec?.structure ? ` · ${it.runSpec.structure}` : ""}
                        {it.runSpec?.paceSecPerKm ? ` · ${formatPace(it.runSpec.paceSecPerKm[0])}–${formatPace(it.runSpec.paceSecPerKm[1])}/km` : it.runSpec?.hrZone ? ` · ${it.runSpec.hrZone}` : ""}
                        {it.notes ? ` · ${it.notes}` : ""}
                        {it.originalDate && it.originalDate !== it.date ? ` · (antes ${formatDateEs(it.originalDate)})` : ""}
                      </div>
                    </div>
                    <div className="acts">
                      {it.kind === "strength" && it.status !== "done" && it.templateId != null && d === today && <Link className="btn sm primary" href={`/entrenamiento/sesion?t=${it.templateId}&d=${it.dayIndex}&pi=${it.id}`}>Empezar</Link>}
                      {it.kind !== "rest" && <button className="icon-btn" aria-label={`Editar ${it.title}`} onClick={() => setEditing(it)}><Icon name="edit" /></button>}
                    </div>
                  </div>
                ))}
              </div>
              {(realW.length > 0 || realE.length > 0) && (
                <div className="small" style={{ marginTop: 6 }}><b>Real:</b> {[...realW.map((w) => `${w.title}${w.durationMin ? ` (${w.durationMin} min)` : ""}`), ...realE.map((e) => `${SPORT_LABEL[e.sport]}${e.sessionType ? ` ${TYPE_LABEL[e.sessionType].toLowerCase()}` : ""} ${Math.round(e.durationSec / 60)} min`)].join(" · ")}</div>
              )}
              {orig.length > 0 && JSON.stringify(orig.map((o) => o.title)) !== JSON.stringify(its.filter((x) => x.kind !== "rest" || true).map((x) => x.title)) && (
                <div className="xs dim" style={{ marginTop: 4 }}>Plan original: {orig.map((o) => o.title).join(" · ")}</div>
              )}
            </Card>
          );
        })}
      </div>
      <Section title="Propuestas" id="propuestas">
        {proposals.length ? <div className="stack">{proposals.slice(0, 12).map((x) => <ProposalCard key={x.id} p={x} />)}</div> : <Empty title="Sin propuestas">Cuando algo cambie (sesión perdida, cansancio, poco tiempo) aparecerán aquí con su explicación.</Empty>}
      </Section>
      <details className="small" style={{ marginTop: 16 }}>
        <summary className="muted">Reglas que aplica el planificador</summary>
        <ul>{Object.entries(RULES).map(([k, v]) => <li key={k}><b>{k}</b>: {v}</li>)}<li>No se recuperan sesiones perdidas acumulando volumen; no se recortan comidas por días sedentarios.</li></ul>
      </details>
      {editing && <EditItem item={editing} onClose={() => setEditing(null)} onMove={async () => { await propose(proposeReschedule(items ?? [], editing.id, today, p.availability)); setEditing(null); }} />}
      {checkin && <CheckinModal onClose={async () => { setCheckin(false); const c = await tbl("recovery_checkins").get(`checkin-${today}`); if (c) void propose(proposeEaseToday(items ?? [], today, c)); }} />}
      <Modal open={shortOpen} onClose={() => setShortOpen(false)} title="¿Cuánto tiempo tienes?" footer={<button className="btn primary" onClick={async () => { setShortOpen(false); if (minutes) await propose(proposeShorten(items ?? [], today, minutes)); }}>Proponer versión exprés</button>}>
        <Field label="Minutos disponibles hoy"><NumInput value={minutes} onChange={setMinutes} ariaLabel="Minutos disponibles" inputMode="numeric" /></Field>
      </Modal>
    </>
  );
}

function EditItem({ item, onClose, onMove }: { item: PlannedItem; onClose: () => void; onMove: () => void }) {
  const [dur, setDur] = useState<number | null>(item.durationMin);
  const [intensity, setIntensity] = useState(item.intensity);
  const [notes, setNotes] = useState(item.notes ?? "");
  const toast = useToast();
  const save = async (status?: PlannedItem["status"]) => {
    await patch("planned_items", item.id, { durationMin: dur ?? item.durationMin, intensity, notes: notes || null, status: status ?? (dur !== item.durationMin || intensity !== item.intensity ? "modified" : item.status) });
    toast("Plan actualizado");
    onClose();
  };
  return (
    <Modal open title={item.title} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cerrar</button><button className="btn primary" onClick={() => void save()}>Guardar</button></>}>
      <div className="stack">
        <div className="grid g2">
          <Field label="Duración (min)"><NumInput value={dur} onChange={setDur} ariaLabel="Duración" inputMode="numeric" /></Field>
          <Field label="Intensidad">
            <select value={intensity} onChange={(e) => setIntensity(e.target.value as PlannedItem["intensity"])}>
              <option value="easy">Suave</option><option value="moderate">Moderada</option><option value="hard">Dura</option>
            </select>
          </Field>
        </div>
        <Field label="Notas"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="row">
          <button className="btn sm" onClick={() => void save("done")}><Icon name="check" />Marcar hecho</button>
          <button className="btn sm" onClick={() => void save("cancelled")}>Cancelar sesión</button>
          {item.status === "cancelled" && <button className="btn sm" onClick={() => void save("planned")}>Restaurar</button>}
          <button className="btn sm" onClick={onMove}>No pude: proponer otro día</button>
          <button className="btn sm ghost" onClick={async () => { await patch("planned_items", item.id, { locked: !item.locked }); onClose(); }}><Icon name={item.locked ? "unlock" : "lock"} />{item.locked ? "Desbloquear" : "Bloquear"}</button>
        </div>
        <p className="xs dim">Los cambios manuales se registran como "Modificado"; el plan original de la semana se conserva para comparar.</p>
      </div>
    </Modal>
  );
}
