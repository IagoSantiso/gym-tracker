"use client";
import { WeeklyEnergy } from "@/components/nutrition/WeeklyEnergy";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, Empty, Field, Icon, Kpi, Notice, PageHead, SourceBadge, Tabs, confirmAction, useTabParam, useToast } from "@/components/ui";
import { BarChart, LineChart } from "@/components/charts";
import { QuickLog, type QuickKind } from "@/components/log/QuickLog";
import { useLive, useProfile } from "@/lib/db/hooks";
import { tbl } from "@/lib/db/db";
import { active, all, nowIso, patch, put, remove } from "@/lib/db/repo";
import { weightTrend, weeklyRate } from "@/lib/domain/nutrition/targets";
import { summarizeByExercise, detectPlateau } from "@/lib/domain/training/progression";
import { findExercise } from "@/lib/domain/training/library";
import { addDays, formatDateEs, formatPace, localDate, weekStartOf, WEEKDAYS_SHORT_ES } from "@/lib/domain/time";
import { buildReview, REVIEW_VERSION } from "@/lib/domain/review/weekly";
import { weekData } from "@/lib/services/review";

const TABS = ["peso", "fuerza", "resistencia", "calendario", "semana"] as const;
type Tab = (typeof TABS)[number];
const dayMs = (d: string) => Date.parse(d + "T12:00:00Z");
const fmtD = (ms: number) => new Date(ms).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });

export function ProgressPage() {
  const [tab, setTab] = useTabParam<Tab>("peso", TABS);
  const [quick, setQuick] = useState<QuickKind>(null);
  return (
    <>
      <PageHead eyebrow="Evolución" title="Tendencias, no días sueltos" actions={<Link className="btn" href="/informe"><Icon name="printer" />Informe para consulta</Link>}>
        Relaciona tu alimentación y actividad con la tendencia de peso de varias semanas.
      </PageHead>
      <Tabs label="Progreso" value={tab} onChange={setTab} tabs={[
        { id: "peso", label: "Peso" }, { id: "fuerza", label: "Fuerza" }, { id: "resistencia", label: "Resistencia" },
        { id: "calendario", label: "Calendario" }, { id: "semana", label: "Revisión semanal" },
      ]} />
      {tab === "peso" && <div className="stack"><WeeklyEnergy/><WeightTab onAdd={() => setQuick("weight")} /></div>}
      {tab === "fuerza" && <StrengthTab />}
      {tab === "resistencia" && <EnduranceTab />}
      {tab === "calendario" && <CalendarTab />}
      {tab === "semana" && <WeeklyTab />}
      <QuickLog kind={quick} onClose={() => setQuick(null)} />
    </>
  );
}

function WeightTab({ onAdd }: { onAdd: () => void }) {
  const entries = useLive(async () => (await all("weight_entries")).sort((a, b) => a.date.localeCompare(b.date)), []) ?? [];
  const waist = useLive(async () => (await all("body_measurements")).filter((m) => m.kind === "waist").sort((a, b) => a.date.localeCompare(b.date)), []) ?? [];
  const trend = weightTrend(entries.map((e) => ({ date: e.date, weightKg: e.weightKg })));
  const rate = weeklyRate(trend);
  return (
    <div className="stack">
      <div className="row"><button className="btn primary" onClick={onAdd}><Icon name="plus" />Registrar peso</button></div>
      {entries.length < 2 ? <Empty title="Pocos registros">Pésate en condiciones parecidas (p. ej. al levantarte) 2–4 veces por semana.</Empty> : (
        <>
          <div className="grid g3">
            <Kpi value={`${trend.at(-1)!.trend.toLocaleString("es-ES")} kg`} label="tendencia actual (media móvil)" source="calculated" />
            <Kpi value={rate == null ? "—" : `${rate > 0 ? "+" : ""}${rate.toLocaleString("es-ES")} kg/sem`} label="ritmo (últimas 4 semanas)" source="calculated" />
            <Kpi value={entries.length} label="registros" />
          </div>
          <Card title="Peso y tendencia">
            <LineChart title="Peso registrado y tendencia suavizada" xFmt={fmtD} yFmt={(v) => v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} yUnit="kg"
              series={[
                { id: "w", label: "Registro", color: "var(--chart-2)", points: trend.map((t) => ({ x: dayMs(t.date), y: t.weightKg })), dots: true },
                { id: "t", label: "Tendencia", color: "var(--chart-1)", points: trend.map((t) => ({ x: dayMs(t.date), y: t.trend })) },
              ]} />
            <p className="xs dim">Las fluctuaciones diarias (agua, glucógeno, sal) son normales: la línea de tendencia es la que importa.</p>
          </Card>
        </>
      )}
      {waist.length > 1 && (
        <Card title="Cintura">
          <LineChart title="Perímetro de cintura" xFmt={fmtD} yUnit="cm" series={[{ id: "c", label: "Cintura", color: "var(--chart-3)", dots: true, points: waist.map((w) => ({ x: dayMs(w.date), y: w.value })) }]} />
        </Card>
      )}
      {entries.length > 0 && (
        <Card title="Registros">
          <div className="list">
            {[...entries].reverse().slice(0, 20).map((e) => (
              <div className="li" key={e.id}>
                <div className="grow"><div className="t">{e.weightKg.toLocaleString("es-ES")} kg</div><div className="s">{formatDateEs(e.date)}{e.note ? ` · ${e.note}` : ""}</div></div>
                <SourceBadge source={e.source} />
                <button className="icon-btn" aria-label="Borrar registro" onClick={() => confirmAction("¿Borrar este registro?") && void remove("weight_entries", e.id)}><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function StrengthTab() {
  const data = useLive(async () => {
    const sessions = (await all("workout_sessions")).filter((s) => s.status === "completed");
    const dates = Object.fromEntries(sessions.map((s) => [s.id, s.date]));
    return summarizeByExercise(await all("exercise_sets"), dates);
  }, []);
  const ids = Object.keys(data ?? {}).filter((k) => (data![k].length ?? 0) > 0).sort((a, b) => (findExercise(a)?.name ?? a).localeCompare(findExercise(b)?.name ?? b));
  const [sel, setSel] = useState<string>("");
  const ex = sel || ids[0];
  const hist = ex && data ? data[ex] : [];
  const weekly = useMemo(() => {
    const m = new Map<string, { top: number; vol: number }>();
    hist.forEach((h) => {
      const w = weekStartOf(h.date);
      const cur = m.get(w) ?? { top: 0, vol: 0 };
      m.set(w, { top: Math.max(cur.top, h.topWeight), vol: cur.vol + h.volume });
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [hist]);
  if (!data) return null;
  if (!ids.length) return <Empty title="Sin series registradas" action={<Link className="btn primary" href="/entrenamiento">Ir a entrenar</Link>} />;
  const pl = detectPlateau(hist);
  return (
    <div className="stack">
      <Field label="Ejercicio">
        <select value={ex} onChange={(e) => setSel(e.target.value)}>{ids.map((id) => <option key={id} value={id}>{findExercise(id)?.name ?? id}</option>)}</select>
      </Field>
      {pl.plateau && <Notice kind="warn">Posible estancamiento (orientativo): {pl.detail}</Notice>}
      <Card title="Peso máximo por semana" sub="Serie de trabajo más pesada">
        <LineChart title="Peso máximo semanal" xFmt={(x) => fmtD(x)} yUnit="kg" yFmt={(v) => v.toLocaleString("es-ES", { maximumFractionDigits: 1 })}
          series={[
            { id: "top", label: "Peso máximo", color: "var(--chart-1)", dots: true, points: weekly.map(([w, v]) => ({ x: dayMs(w), y: v.top })) },
            { id: "e1", label: "1RM estimado (Epley)", color: "var(--chart-3)", dashed: true, points: weekly.map(([w]) => ({ x: dayMs(w), y: Math.round(Math.max(0, ...hist.filter((h) => weekStartOf(h.date) === w).map((h) => h.best1RM ?? 0))) || null })) },
          ]} />
        <p className="xs dim">El 1RM es una estimación (fórmula de Epley con RIR), no una medición.</p>
      </Card>
      <Card title="Volumen por semana" sub="Series × repeticiones × kg (series de trabajo completadas)">
        <BarChart title="Volumen semanal" unit="kg" yFmt={(v) => (v >= 1000 ? `${(v / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}k` : String(Math.round(v)))} data={weekly.map(([w, v]) => ({ label: fmtD(dayMs(w)), value: Math.round(v.vol) }))} />
      </Card>
    </div>
  );
}

function EnduranceTab() {
  const s = useLive(() => all("endurance_sessions"), []) ?? [];
  const weeks = Array.from({ length: 10 }, (_, i) => addDays(weekStartOf(localDate()), -7 * (9 - i)));
  const runs = s.filter((x) => x.sport === "run");
  const easy = runs.filter((r) => r.distanceM && (r.sessionType === "easy" || r.sessionType === "long" || r.sessionType === "recovery")).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="stack">
      <Card title="Kilómetros de carrera por semana">
        <BarChart title="Km de carrera semanales" unit="km" yFmt={(v) => v.toLocaleString("es-ES", { maximumFractionDigits: 1 })}
          data={weeks.map((w) => ({ label: fmtD(dayMs(w)), value: Math.round(runs.filter((r) => weekStartOf(r.date) === w).reduce((a, r) => a + (r.distanceM ?? 0) / 1000, 0) * 10) / 10 }))} />
      </Card>
      <Card title="Ritmo en rodajes fáciles" sub="Útil para ver adaptación aeróbica (depende de calor, terreno y fatiga)">
        {easy.length >= 2 ? <LineChart title="Ritmo medio de rodajes fáciles" xFmt={fmtD} yFmt={(v) => formatPace(v)} yUnit="/km"
          series={[{ id: "p", label: "Ritmo", color: "var(--chart-2)", dots: true, points: easy.map((r) => ({ x: dayMs(r.date), y: Math.round(r.durationSec / (r.distanceM! / 1000)) })) }]} /> : <p className="small muted">Registra al menos 2 rodajes fáciles con distancia.</p>}
      </Card>
      <Card title="Bici y caminata por semana (min)">
        <BarChart title="Minutos de bici semanales" unit="min" color="var(--chart-3)" data={weeks.map((w) => ({ label: fmtD(dayMs(w)), value: Math.round(s.filter((x) => x.sport === "bike" && weekStartOf(x.date) === w).reduce((a, x) => a + x.durationSec / 60, 0)) }))} />
        <BarChart title="Minutos de caminata y cinta semanales" unit="min" color="var(--chart-4)" data={weeks.map((w) => ({ label: fmtD(dayMs(w)), value: Math.round(s.filter((x) => (x.sport === "walk" || x.sport === "treadmill") && weekStartOf(x.date) === w).reduce((a, x) => a + x.durationSec / 60, 0)) }))} />
      </Card>
    </div>
  );
}

function CalendarTab() {
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const data = useLive(async () => {
    const w = (await all("workout_sessions")).filter((s) => s.status === "completed" && s.date.startsWith(month));
    const e = (await all("endurance_sessions")).filter((s) => s.date.startsWith(month));
    return { w, e };
  }, [month]);
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const today = localDate();
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <Card title={label} right={<div className="row"><button className="icon-btn" aria-label="Mes anterior" onClick={() => shift(-1)}><Icon name="left" /></button><button className="icon-btn" aria-label="Mes siguiente" onClick={() => shift(1)}><Icon name="right" /></button></div>}>
      <div className="cal" role="grid" aria-label={`Calendario de sesiones de ${label}`}>
        {WEEKDAYS_SHORT_ES.map((d) => <div key={d} className="h">{d}</div>)}
        {Array.from({ length: offset }, (_, i) => <div key={`e${i}`} style={{ background: "none" }} />)}
        {Array.from({ length: daysIn }, (_, i) => {
          const date = addDays(first, i);
          const n = (data?.w.filter((s) => s.date === date).length ?? 0) + (data?.e.filter((s) => s.date === date).length ?? 0);
          const kinds = [...(data?.w.some((s) => s.date === date) ? ["F"] : []), ...[...new Set(data?.e.filter((s) => s.date === date).map((s) => (s.sport === "run" ? "C" : s.sport === "bike" ? "B" : "A")))]];
          return (
            <div key={date} className={`${n ? "on" : ""} ${date === today ? "today" : ""}`} role="gridcell" aria-label={`${date}: ${n} sesiones`}
              style={{ background: n ? `color-mix(in srgb, var(--lime) ${Math.min(100, 45 + n * 25)}%, var(--panel2))` : undefined }}>
              <span>{i + 1}</span>
              {kinds.length > 0 && <span style={{ position: "absolute", bottom: 2, fontSize: 9 }}>{kinds.join("")}</span>}
            </div>
          );
        })}
      </div>
      <p className="xs dim" style={{ marginTop: 8 }}>F = fuerza · C = carrera · B = bici · A = caminata/otra. Más intenso = más sesiones ese día.</p>
    </Card>
  );
}

function WeeklyTab() {
  const p = useProfile();
  const toast = useToast();
  const [ws, setWs] = useState(addDays(weekStartOf(localDate()), -7));
  const data = useLive(() => weekData(ws, p.timezone), [ws, p.timezone]);
  const exps = useLive(async () => (await all("experiments")).sort((a, b) => b.weekStart.localeCompare(a.weekStart)), []) ?? [];
  const saved = useLive(async () => (await tbl("weekly_reviews").where("weekStart").equals(ws).toArray()).find(active), [ws]);
  if (!data) return <div className="empty-state">Calculando…</div>;
  const r = buildReview(data);
  const nextWs = addDays(ws, 7);
  const exp = exps.find((e) => e.weekStart === nextWs);
  const f1 = (v: number | null, u = "") => (v == null ? "—" : `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })}${u}`);
  return (
    <div className="stack">
      <div className="row">
        <button className="icon-btn" aria-label="Semana anterior" onClick={() => setWs(addDays(ws, -7))}><Icon name="left" /></button>
        <b>Semana del {formatDateEs(ws, { day: "numeric", month: "long" })}</b>
        <button className="icon-btn" aria-label="Semana siguiente" onClick={() => setWs(addDays(ws, 7))}><Icon name="right" /></button>
      </div>
      <div className="grid g4">
        <Kpi value={`${data.done}/${data.planned}`} label="sesiones previstas hechas" />
        <Kpi value={`${f1(data.runKm)} km`} label={`carrera · ${Math.round(data.bikeMin)} min bici · ${Math.round(data.walkMin)} min caminata`} />
        <Kpi value={data.trendDeltaKg == null ? "—" : `${data.trendDeltaKg > 0 ? "+" : ""}${f1(data.trendDeltaKg)} kg`} label="cambio en la tendencia de peso" source="calculated" />
        <Kpi value={f1(data.sleepAvgH, " h")} label="sueño medio" />
        <Kpi value={f1(data.proteinAvgG, " g")} label={`proteína media/día (${data.mealsLoggedDays} días registrados)`} source="calculated" />
        <Kpi value={f1(data.fiberAvgG, " g")} label="fibra media/día" source="calculated" />
        <Kpi value={f1(data.carbsAvgG, " g")} label="hidratos disponibles/día" source="calculated" />
        <Kpi value={data.cgm ? `${Math.round(data.cgm.tir)} %` : "—"} label={data.cgm ? `en rango · < rango ${Math.round(data.cgm.tbr)} % · > rango ${Math.round(data.cgm.tar)} % · CV ${f1(data.cgm.cv, " %")} · cobertura ${Math.round(data.cgm.coverage)} %` : "sin datos CGM"} source={data.cgm ? "calculated" : undefined} />
      </div>
      <Card title="3 logros">
        {r.achievements.length ? <ol className="small" style={{ margin: 0 }}>{r.achievements.map((a) => <li key={a}>{a}</li>)}</ol> : <p className="small muted">Pocos datos esta semana.</p>}
      </Card>
      <Card title="2 oportunidades">
        {r.opportunities.length ? <ol className="small" style={{ margin: 0 }}>{r.opportunities.map((a) => <li key={a}>{a}</li>)}</ol> : <p className="small muted">Nada destacable: sigue así.</p>}
      </Card>
      {r.experiment && (
        <Card title={`1 experimento para la semana siguiente: ${r.experiment.title}`} sub="Hábito pequeño y no clínico. Tú decides.">
          <p className="small">{r.experiment.description}</p>
          {exp ? (
            <div className="stack">
              <span className={`badge ${exp.status === "accepted" || exp.status === "done" ? "ok" : ""}`}>{{ proposed: "Propuesto", accepted: "Aceptado", rejected: "Rechazado", done: "Hecho" }[exp.status]}</span>
              {exp.status === "accepted" && (
                <Field label="¿Cómo fue? (resultado)"><textarea defaultValue={exp.result ?? ""} onBlur={(e) => void patch("experiments", exp.id, { result: e.target.value || null })} /></Field>
              )}
              {exp.status === "accepted" && <button className="btn sm" onClick={() => void patch("experiments", exp.id, { status: "done" })}>Marcar como hecho</button>}
            </div>
          ) : (
            <div className="row">
              <button className="btn sm primary" onClick={async () => { await put("experiments", { weekStart: nextWs, title: r.experiment!.title, description: r.experiment!.description, status: "accepted", reason: null, result: null }); toast("Experimento aceptado"); }}>Aceptar</button>
              <button className="btn sm ghost" onClick={async () => { const reason = prompt("Motivo (opcional)") ?? null; await put("experiments", { weekStart: nextWs, title: r.experiment!.title, description: r.experiment!.description, status: "rejected", reason, result: null }); }}>Rechazar</button>
            </div>
          )}
        </Card>
      )}
      {r.notes.map((n) => <Notice key={n} kind="info">{n}</Notice>)}
      <div className="row">
        <button className="btn" onClick={async () => {
          await put("weekly_reviews", { ...(saved ? { id: saved.id } : {}), weekStart: ws, generatedAt: nowIso(), version: REVIEW_VERSION, data: data as unknown as Record<string, unknown>, achievements: r.achievements, opportunities: r.opportunities, notes: null });
          toast("Revisión guardada");
        }}><Icon name="download" />{saved ? "Actualizar revisión guardada" : "Guardar revisión"}</button>
        <Link className="btn ghost" href={`/asistente?q=${encodeURIComponent("Resume mi semana y prepárame 3 preguntas para la consulta")}`}><Icon name="chat" />Pedir resumen al asistente</Link>
      </div>
    </div>
  );
}
