"use client";
import { enduranceKcal, strengthKcal } from "@/lib/domain/nutrition/energy";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, Empty, Field, Icon, Kpi, Modal, Notice, NumInput, PageHead, SourceBadge, Tabs, confirmAction, useTabParam, useToast } from "@/components/ui";
import { BarChart } from "@/components/charts";
import { BodyMap } from "@/components/training/BodyMap";
import { QuickLog, type QuickKind } from "@/components/log/QuickLog";
import { useLive, useGoals, usePreferences, useProfile, useTable } from "@/lib/db/hooks";
import { tbl } from "@/lib/db/db";
import { active, all, patch, put, remove } from "@/lib/db/repo";
import { EQUIPMENT_LABEL, LIBRARY, MUSCLE_LABEL, findExercise, type LibraryExercise } from "@/lib/domain/training/library";
import { weeklyVolumeByMuscle } from "@/lib/domain/training/progression";
import { SPORT_LABEL, TYPE_LABEL, acwr, buildRunPlan, dailyLoads, intensityDistribution, paceGuide } from "@/lib/domain/training/endurance";
import { addDays, formatDateEs, formatDuration, formatPace, localDate, weekStartOf } from "@/lib/domain/time";
import type { EquipmentId, MuscleId, WorkoutTemplate } from "@/lib/db/types";
import { download } from "@/lib/services/data";

const TABS = ["hoy", "rutinas", "biblioteca", "cardio", "historial", "volumen"] as const;
type Tab = (typeof TABS)[number];

export function TrainingPage() {
  const [tab, setTab] = useTabParam<Tab>("hoy", TABS);
  const [quick, setQuick] = useState<QuickKind>(null);
  return (
    <>
      <PageHead eyebrow="Entrenamiento" title="Fuerza, carrera, bici y movimiento" actions={<button className="btn" onClick={() => setQuick("activity")}><Icon name="plus" />Actividad</button>}>
        Ejecuta tu sesión serie a serie con temporizador y pantalla activa, o registra carrera, bici y cinta.
      </PageHead>
      <Tabs label="Entrenamiento" value={tab} onChange={setTab} tabs={[
        { id: "hoy", label: "Sesiones" }, { id: "rutinas", label: "Rutinas" }, { id: "biblioteca", label: "Biblioteca" },
        { id: "cardio", label: "Cardio" }, { id: "historial", label: "Historial" }, { id: "volumen", label: "Volumen y carga" },
      ]} />
      {tab === "hoy" && <SessionsTab />}
      {tab === "rutinas" && <RoutinesTab />}
      {tab === "biblioteca" && <LibraryTab />}
      {tab === "cardio" && <CardioTab onAdd={() => setQuick("activity")} />}
      {tab === "historial" && <HistoryTab />}
      {tab === "volumen" && <VolumeTab />}
      <QuickLog kind={quick} onClose={() => setQuick(null)} />
    </>
  );
}

function SessionsTab() {
  const prefs = usePreferences();
  const template = useLive(() => (prefs.activeTemplateId ? tbl("workout_templates").get(prefs.activeTemplateId) : undefined), [prefs.activeTemplateId]);
  const today = localDate();
  const planned = useLive(async () => (await tbl("planned_items").where("date").equals(today).toArray()).filter((i) => active(i) && i.kind === "strength"), [today]) ?? [];
  const open = useLive(async () => (await tbl("workout_sessions").where("status").equals("in_progress").toArray()).filter(active), []) ?? [];
  const done = useLive(async () => (await all("workout_sessions")).filter((s) => s.status === "completed" && s.date >= weekStartOf(today)), [today]) ?? [];
  if (!template) return <Empty title="Sin rutina activa" action={<Link className="btn primary" href="/entrenamiento?tab=rutinas">Elegir rutina</Link>} />;
  return (
    <div className="stack">
      {open.map((s) => (
        <Notice key={s.id} kind="warn" icon="clock">
          Sesión en curso: <b>{s.title}</b> ({s.date}). <Link href={`/entrenamiento/sesion?t=${s.templateId}&d=${s.dayIndex}`}>Continuar</Link>
        </Notice>
      ))}
      <div className="sec-head" style={{ margin: "6px 0 4px" }}><h2>{template.name}</h2><span className="pill">{done.length} hechas esta semana</span></div>
      <div className={`days n${Math.min(3, template.days.length)}`}>
        {template.days.map((d, i) => {
          const isToday = planned.some((p) => p.templateId === template.id && p.dayIndex === i);
          const pi = planned.find((p) => p.templateId === template.id && p.dayIndex === i);
          const sets = d.items.reduce((a, it) => a + (prefs.adaptationMode ? Math.min(2, it.sets) : it.sets), 0);
          return (
            <Link key={i} className={`day ${isToday ? "on" : ""}`} href={`/entrenamiento/sesion?t=${template.id}&d=${i}${pi ? `&pi=${pi.id}` : ""}`} style={{ textDecoration: "none", color: "inherit" }}>
              <span className="n">DÍA {String(i + 1).padStart(2, "0")}{isToday ? " · HOY" : ""}</span>
              <strong>{d.title}</strong>
              <small>{d.items.length} ejercicios · {sets} series</small>
              <div className="mini">{d.subtitle.split(" · ").slice(0, 3).map((t) => <span key={t}>{t}</span>)}</div>
            </Link>
          );
        })}
      </div>
      <p className="small muted">Pulsa un día para empezar. Al marcar una serie arranca el descanso; la pantalla no se apaga mientras haya una sesión abierta.</p>
    </div>
  );
}

function RoutinesTab() {
  const prefs = usePreferences();
  const templates = useTable("workout_templates") ?? [];
  const toast = useToast();
  const importJson = async (f?: File) => {
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j?.name || !Array.isArray(j.days)) throw new Error();
      const days = j.days.map((d: WorkoutTemplate["days"][number]) => ({
        title: String(d.title ?? "Día"), subtitle: String(d.subtitle ?? ""), focus: d.focus ?? "custom",
        items: (d.items ?? []).filter((it) => findExercise(it.exerciseId)).map((it) => ({
          exerciseId: it.exerciseId, sets: Math.min(10, Math.max(1, Number(it.sets) || 3)), repsMin: Number(it.repsMin) || 8, repsMax: Number(it.repsMax) || 12,
          rir: Math.min(5, Math.max(0, Number(it.rir ?? 2))), restSec: Number(it.restSec) || 90, tempo: it.tempo ?? null, notes: it.notes ?? null, repsLabel: it.repsLabel ?? null,
        })),
      }));
      await put("workout_templates", { name: `${j.name} (importada)`, kind: "custom", days, source: "imported", description: j.description ?? null });
      toast("Rutina importada");
    } catch {
      toast("Archivo de rutina no válido");
    }
  };
  return (
    <div className="stack">
      <div className="row">
        <Link className="btn primary" href="/entrenamiento/rutina"><Icon name="plus" />Nueva rutina</Link>
        <label className="btn"><Icon name="upload" />Importar JSON<input type="file" accept=".json,application/json" hidden onChange={(e) => void importJson(e.target.files?.[0])} /></label>
      </div>
      {templates.map((t) => (
        <Card key={t.id} title={t.name} sub={`${t.days.length} días · ${t.days.reduce((a, d) => a + d.items.length, 0)} ejercicios${t.description ? ` · ${t.description}` : ""}`}
          right={prefs.activeTemplateId === t.id ? <span className="badge ok">Activa</span> : <SourceBadge source={t.source} />}>
          <div className="row">
            {prefs.activeTemplateId !== t.id && <button className="btn sm primary" onClick={() => void patch("preferences", "me", { activeTemplateId: t.id, strengthDaysPerWeek: t.days.length >= 3 ? 3 : 2 })}>Activar</button>}
            <Link className="btn sm" href={`/entrenamiento/rutina?id=${t.id}`}><Icon name="edit" />Editar</Link>
            <button className="btn sm ghost" onClick={async () => { const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = t; await put("workout_templates", { ...rest, name: `${t.name} (copia)`, source: "manual" }); toast("Rutina duplicada"); }}>Duplicar</button>
            <button className="btn sm ghost" onClick={() => download(new Blob([JSON.stringify({ name: t.name, description: t.description, days: t.days }, null, 2)], { type: "application/json" }), `rutina-${t.id}.json`)}><Icon name="download" />Exportar</button>
            {t.source !== "seed" && <button className="btn sm danger" onClick={() => confirmAction(`¿Borrar "${t.name}"?`) && void remove("workout_templates", t.id)}>Borrar</button>}
          </div>
        </Card>
      ))}
    </div>
  );
}

function LibraryTab() {
  const [eq, setEq] = useState<EquipmentId | "">("");
  const [mus, setMus] = useState<MuscleId | "">("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<LibraryExercise | null>(null);
  const list = LIBRARY.filter((e) => (!eq || e.equipment.includes(eq)) && (!mus || e.primary.includes(mus) || e.secondary.includes(mus)) && (!q || e.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="stack">
      <div className="grid g3">
        <Field label="Buscar"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="p. ej. remo" /></Field>
        <Field label="Material">
          <select value={eq} onChange={(e) => setEq(e.target.value as EquipmentId | "")}>
            <option value="">Todo</option>
            {(["machine", "barbell", "dumbbell", "cable", "band", "bodyweight", "kettlebell", "smith", "pullup_bar"] as EquipmentId[]).map((k) => <option key={k} value={k}>{EQUIPMENT_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Músculo">
          <select value={mus} onChange={(e) => setMus(e.target.value as MuscleId | "")}>
            <option value="">Todos</option>
            {(Object.keys(MUSCLE_LABEL) as MuscleId[]).map((k) => <option key={k} value={k}>{MUSCLE_LABEL[k]}</option>)}
          </select>
        </Field>
      </div>
      <p className="small muted">{list.length} ejercicios · fotos de free-exercise-db (dominio público)</p>
      <div className="grid g3">
        {list.map((e) => (
          <button key={e.id} className="card tight" style={{ textAlign: "left", padding: 0, overflow: "hidden" }} onClick={() => setSel(e)}>
            {e.photos ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/exercises/${e.id}-0.jpg`} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "3/2", objectFit: "cover", display: "block" }} />
            ) : <div style={{ aspectRatio: "3/2", display: "grid", placeItems: "center", background: "var(--bg2)" }}><BodyMap primary={e.primary} secondary={e.secondary} /></div>}
            <div style={{ padding: "10px 12px" }}>
              <div className="grp" style={{ fontSize: 10, color: "var(--accent)", fontWeight: 850, letterSpacing: ".14em", textTransform: "uppercase" }}>{e.group}</div>
              <div style={{ fontWeight: 700 }}>{e.name}</div>
              <div className="xs muted">{e.equipment.map((x) => EQUIPMENT_LABEL[x]).join(" · ")} · {"●".repeat(e.difficulty)}{"○".repeat(3 - e.difficulty)}</div>
            </div>
          </button>
        ))}
      </div>
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.name ?? ""}>
        {sel && (
          <div className="stack">
            {sel.photos && (
              <div className="row" style={{ flexWrap: "nowrap" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/exercises/${sel.id}-0.jpg`} alt={`${sel.name}: inicio`} style={{ width: "50%", borderRadius: 10 }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/exercises/${sel.id}-1.jpg`} alt={`${sel.name}: final`} style={{ width: "50%", borderRadius: 10 }} />
              </div>
            )}
            <div className="anat"><BodyMap primary={sel.primary} secondary={sel.secondary} /><div className="mus"><div className="k">Principal</div><p>{sel.main}</p><div className="k">Secundario</div><p>{sel.sec}</p></div></div>
            <ul className="cues">{sel.cues.map((c) => <li key={c}>{c}</li>)}</ul>
            <div className="small"><b>Errores frecuentes:</b> {sel.errors.join(" · ")}</div>
            {sel.caution && <Notice kind="warn">{sel.caution} (orientación general; no sustituye a un profesional)</Notice>}
            <div className="small muted">Material: {sel.equipment.map((x) => EQUIPMENT_LABEL[x]).join(", ")} · Descanso típico {sel.restSec} s · Incremento sugerido {sel.incrementKg || "—"} kg</div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CardioTab({ onAdd }: { onAdd: () => void }) {
  const p = useProfile();
  const g = useGoals();
  const toast = useToast();
  const sessions = useLive(async () => (await all("endurance_sessions")).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), []) ?? [];
  const kg = useLive(async () => (await all("weight_entries")).sort((a, b) => b.date.localeCompare(a.date))[0]?.weightKg ?? null, []);
  const shoes = useTable("shoes") ?? [];
  const [shoeName, setShoeName] = useState("");
  const [plan, setPlan] = useState({ distanceKm: g.raceGoal?.distanceKm ?? 10, weeks: 8, days: 3 });
  const guide = paceGuide(p.runRef);
  const weeklyMin = useMemo(() => {
    const from = addDays(localDate(), -28);
    return Math.round(sessions.filter((s) => s.sport === "run" && s.date >= from).reduce((a, s) => a + s.durationSec / 60, 0) / 4);
  }, [sessions]);
  const preview = buildRunPlan({ distanceKm: plan.distanceKm, weeks: plan.weeks, daysPerWeek: plan.days, currentWeeklyMin: weeklyMin || 90, level: p.experience === "intermediate" || p.experience === "advanced" ? "intermediate" : "beginner", ref: p.runRef });
  const shoeKm = (id: string) => sessions.filter((s) => s.shoeId === id).reduce((a, s) => a + (s.distanceM ?? 0) / 1000, 0);
  return (
    <div className="stack">
      <div className="row"><button className="btn primary" onClick={onAdd}><Icon name="plus" />Registrar carrera, bici o cinta</button></div>
      <Card title="Actividades recientes">
        {sessions.length ? (
          <div className="list">
            {sessions.slice(0, 15).map((s) => (
              <div className="li" key={s.id}>
                <Icon name={s.sport === "bike" ? "bike" : s.sport === "run" ? "run" : "walk"} />
                <div className="grow">
                  <div className="t">{SPORT_LABEL[s.sport]}{s.sessionType ? ` · ${TYPE_LABEL[s.sessionType]}` : ""}{s.whileWorking ? " · teletrabajo" : ""}</div>
                  <div className="s">
                    {formatDateEs(s.date)} · {formatDuration(s.durationSec)}
                    {s.distanceM ? ` · ${(s.distanceM / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} km` : ""}
                    {s.distanceM && s.sport === "run" ? ` · ${formatPace(s.durationSec / (s.distanceM / 1000))}/km` : ""}
                    {s.avgHr ? ` · FC ${s.avgHr}` : ""}{s.rpe != null ? ` · RPE ${s.rpe}` : ""}{s.avgPowerW ? ` · ${s.avgPowerW} W` : ""}
                    {s.treadmillSpeedKmh ? ` · ${s.treadmillSpeedKmh} km/h ${s.treadmillInclinePct ?? 0} %` : ""}
                    {kg ? ` · ~${Math.round(enduranceKcal(s, kg) / 10) * 10} kcal` : ""}
                  </div>
                  {s.whileWorking && <button className="link-btn xs" onClick={() => void patch("endurance_sessions", s.id, { whileWorking: false }).then(() => toast("Corregido: ya no cuenta como teletrabajo"))}>¿No era en cinta de escritorio? Corregir</button>}
                </div>
                <SourceBadge source={s.source} />
                <button className="icon-btn" aria-label="Borrar actividad" onClick={() => confirmAction("¿Borrar esta actividad?") && void remove("endurance_sessions", s.id)}><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        ) : <Empty title="Sin actividades">Regístralas a mano, importa TCX/GPX o conecta Polar en Ajustes.</Empty>}
      </Card>
      <Card title="Plan de carrera" sub="Progresión prudente (~5–8 %/semana) con descarga cada 4.ª semana. No es una garantía: ajústalo a cómo te recuperes y a la fuerza de piernas y la bici.">
        <div className="grid g3">
          <Field label="Objetivo">
            <select value={plan.distanceKm} onChange={(e) => setPlan({ ...plan, distanceKm: Number(e.target.value) })}>
              <option value={5}>5K</option><option value={10}>10K</option><option value={21.0975}>Media maratón</option>
            </select>
          </Field>
          <Field label="Semanas"><NumInput value={plan.weeks} ariaLabel="Semanas" inputMode="numeric" min={4} max={20} onChange={(n) => setPlan({ ...plan, weeks: n ?? 8 })} /></Field>
          <Field label="Días de carrera/semana"><NumInput value={plan.days} ariaLabel="Días por semana" inputMode="numeric" min={2} max={5} onChange={(n) => setPlan({ ...plan, days: n ?? 3 })} /></Field>
        </div>
        {guide ? <p className="small muted">Ritmos orientativos (desde tu marca): fácil {formatPace(guide.easy[0])}–{formatPace(guide.easy[1])}/km · tempo {formatPace(guide.tempo[0])}–{formatPace(guide.tempo[1])}/km · intervalos {formatPace(guide.intervals[0])}–{formatPace(guide.intervals[1])}/km.</p>
          : <p className="small muted">Añade una marca reciente en Ajustes → Perfil para ver ritmos orientativos; mientras, usa RPE y zonas de FC.</p>}
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Sem.</th><th>Total</th><th>Sesiones</th></tr></thead>
            <tbody>
              {preview.map((w) => (
                <tr key={w.week}><td>{w.week}{w.recovery ? " (descarga)" : ""}</td><td>{w.totalMin} min</td>
                  <td>{w.sessions.map((s) => `${TYPE_LABEL[s.type]}${s.durationMin ? ` ${s.durationMin}′` : ""}`).join(" · ")}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn sm primary" style={{ marginTop: 10 }} onClick={async () => {
          const date = addDays(weekStartOf(localDate()), plan.weeks * 7 - 1);
          await patch("goals", "me", { raceGoal: { distanceKm: plan.distanceKm, date, targetTimeSec: g.raceGoal?.targetTimeSec ?? null } });
          toast("Objetivo guardado: el plan semanal lo usará al regenerarse");
        }}>Usar como objetivo</button>
      </Card>
      <Card title="Zapatillas" sub="Kilometraje acumulado (opcional).">
        <div className="list">
          {shoes.map((s) => {
            const km = s.startKm + shoeKm(s.id);
            return (
              <div className="li" key={s.id}>
                <div className="grow"><div className="t">{s.name}{s.retired ? " (retiradas)" : ""}</div><div className="s">{km.toLocaleString("es-ES", { maximumFractionDigits: 0 })} km</div></div>
                <button className="btn sm ghost" onClick={() => void patch("shoes", s.id, { retired: !s.retired })}>{s.retired ? "Reactivar" : "Retirar"}</button>
              </div>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input className="input" style={{ maxWidth: 260 }} placeholder="Nombre de las zapatillas" value={shoeName} onChange={(e) => setShoeName(e.target.value)} aria-label="Nombre de las zapatillas" />
          <button className="btn sm" disabled={!shoeName.trim()} onClick={async () => { await put("shoes", { name: shoeName.trim(), startKm: 0, retired: false, notes: null }); setShoeName(""); }}>Añadir</button>
        </div>
      </Card>
    </div>
  );
}

function HistoryTab() {
  const sessions = useLive(async () => (await all("workout_sessions")).filter((s) => s.status === "completed"), []) ?? [];
  const endurance = useLive(() => all("endurance_sessions"), []) ?? [];
  const sets = useLive(() => all("exercise_sets"), []) ?? [];
  const kg = useLive(async () => (await all("weight_entries")).sort((a, b) => b.date.localeCompare(a.date))[0]?.weightKg ?? null, []);
  const [filter, setFilter] = useState<"all" | "strength" | "cardio">("all");
  const rows = [
    ...(filter !== "cardio" ? sessions.map((s) => ({ kind: "strength" as const, key: s.id, date: s.date, at: s.startedAt, s })) : []),
    ...(filter !== "strength" ? endurance.map((e) => ({ kind: "cardio" as const, key: e.id, date: e.date, at: e.startedAt, e })) : []),
  ].sort((x, y) => y.date.localeCompare(x.date) || y.at.localeCompare(x.at)).slice(0, 60);
  return (
    <div className="stack">
      <div className="pill-row">
        {([["all", "Todo"], ["strength", "Fuerza"], ["cardio", "Cardio y cinta"]] as const).map(([v, l]) => <button key={v} className="chip" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
      </div>
      {rows.length ? (
        <Card>
          <div className="list">
            {rows.map((r) => {
              if (r.kind === "cardio") {
                const e = r.e;
                return (
                  <div className="li" key={r.key}>
                    <Icon name={e.sport === "bike" ? "bike" : e.sport === "run" ? "run" : "walk"} />
                    <div className="grow">
                      <div className="t">{SPORT_LABEL[e.sport]}{e.sessionType ? ` · ${TYPE_LABEL[e.sessionType]}` : ""}{e.whileWorking ? " · teletrabajo" : ""}</div>
                      <div className="s">{formatDateEs(e.date)} · {formatDuration(e.durationSec)}{e.distanceM ? ` · ${(e.distanceM / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} km` : ""}{e.treadmillSpeedKmh ? ` · ${e.treadmillSpeedKmh} km/h ${e.treadmillInclinePct ?? 0} %` : ""}{kg ? ` · ~${Math.round(enduranceKcal(e, kg) / 10) * 10} kcal` : ""}</div>
                      {e.whileWorking && <button className="link-btn xs" onClick={() => void patch("endurance_sessions", e.id, { whileWorking: false })}>¿No era en cinta de escritorio? Corregir</button>}
                    </div>
                    <SourceBadge source={e.source} />
                    <button className="icon-btn" aria-label="Borrar actividad" onClick={() => confirmAction("¿Borrar esta actividad?") && void remove("endurance_sessions", e.id)}><Icon name="trash" /></button>
                  </div>
                );
              }
              const s = r.s;
              const ss = sets.filter((x) => x.sessionId === s.id && x.completed);
              const ex = [...new Set(ss.map((x) => x.exerciseId))];
              const vol = ss.reduce((a, x) => a + (x.weightKg ?? 0) * (x.reps ?? 0), 0);
              return (
                <details key={r.key} className="li" style={{ display: "block" }}>
                  <summary style={{ cursor: "pointer", listStyle: "none" }}>
                    <div className="row between" style={{ flexWrap: "nowrap" }}>
                      <div className="row" style={{ gap: 10, flexWrap: "nowrap", minWidth: 0 }}><Icon name="dumbbell" /><div style={{ minWidth: 0 }}><div className="t">{s.title}</div><div className="s">{formatDateEs(s.date)} · {ss.length} series · {ex.length} ejercicios{vol ? ` · ${Math.round(vol).toLocaleString("es-ES")} kg vol.` : ""}{s.durationMin ? ` · ${s.durationMin} min` : ""}{s.rpe ? ` · RPE ${s.rpe}` : ""}{s.deload ? " · descarga" : ""}{kg ? ` · ~${Math.round(strengthKcal(s.durationMin ?? 60, kg) / 10) * 10} kcal` : ""}</div></div></div>
                      <SourceBadge source={s.source} />
                    </div>
                  </summary>
                  <div className="small" style={{ padding: "8px 0" }}>
                    {ex.map((id) => <div key={id}><b>{findExercise(id)?.name ?? id}</b>: {ss.filter((x) => x.exerciseId === id).sort((a, b) => a.setIndex - b.setIndex).map((x) => `${x.weightKg ?? "PC"}×${x.reps ?? "?"}${x.rir != null ? ` @${x.rir}` : ""}`).join(" · ")}</div>)}
                    {s.notes && <div className="muted">Notas: {s.notes}</div>}
                    <button className="btn sm danger" style={{ marginTop: 6 }} onClick={() => confirmAction("¿Borrar esta sesión?") && void remove("workout_sessions", s.id)}>Borrar sesión</button>
                  </div>
                </details>
              );
            })}
          </div>
        </Card>
      ) : <Empty title="Aún no hay entrenamientos guardados">Empieza una sesión de fuerza o registra carrera, bici o cinta con «Actividad».</Empty>}
      <p className="xs dim">kcal: gasto estimado por encima del reposo (±15 %). Cuentan en el balance de energía del día.</p>
    </div>
  );
}

function VolumeTab() {
  const today = localDate();
  const ws = weekStartOf(today);
  const data = useLive(async () => {
    const sessions = (await all("workout_sessions")).filter((s) => s.status === "completed");
    const thisWeek = new Set(sessions.filter((s) => s.date >= ws).map((s) => s.id));
    const sets = (await all("exercise_sets")).filter((s) => thisWeek.has(s.sessionId));
    const endurance = await all("endurance_sessions");
    return { sets, sessions, endurance };
  }, [ws]);
  if (!data) return null;
  const vol = weeklyVolumeByMuscle(data.sets, (id) => findExercise(id));
  const bars = (Object.keys(MUSCLE_LABEL) as MuscleId[]).filter((m) => vol[m]).map((m) => ({ label: MUSCLE_LABEL[m].split(" ")[0], value: vol[m], note: MUSCLE_LABEL[m] })).sort((a, b) => b.value - a.value);
  const loads = dailyLoads(data.endurance, data.sessions);
  const ac = acwr(loads, today);
  const dist = intensityDistribution(data.endurance.filter((e) => e.date >= addDays(today, -27)));
  const totalMin = dist.easy + dist.moderate + dist.hard;
  return (
    <div className="stack">
      <Card title="Series por músculo esta semana" sub="Principal = 1 serie, secundario = 0,5. Referencia orientativa: ~6–12 series/semana por grupo al retomar.">
        {bars.length ? <BarChart title="Series semanales por grupo muscular" data={bars} yFmt={(v) => v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} unit="series" /> : <Empty title="Sin series esta semana" />}
      </Card>
      <Card title="Carga interna (aproximación sRPE)" sub="Duración × RPE de cada sesión. Las sesiones sin RPE no suman.">
        <div className="grid g3">
          <Kpi value={ac.acute} label="Carga últimos 7 días" source="estimated" />
          <Kpi value={ac.chronicWeekly} label="Media semanal (28 d)" source="estimated" />
          <Kpi value={ac.ratio ?? "—"} label="Ratio agudo:crónico" source="estimated" />
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>{ac.note} No es un predictor de lesión.</p>
      </Card>
      <Card title="Distribución de intensidad (28 días, resistencia)">
        {totalMin ? (
          <div className="small">
            Fácil (RPE ≤ 4): <b>{Math.round((dist.easy / totalMin) * 100)} %</b> · Moderado (5–6): <b>{Math.round((dist.moderate / totalMin) * 100)} %</b> · Duro (≥ 7): <b>{Math.round((dist.hard / totalMin) * 100)} %</b>
            {dist.unknown > 0 && <span className="muted"> · {Math.round(dist.unknown)} min sin RPE</span>}
          </div>
        ) : <span className="small muted">Registra RPE en tus actividades para ver la distribución.</span>}
      </Card>
    </div>
  );
}
