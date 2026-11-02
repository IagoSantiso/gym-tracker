"use client";
/** Informe para la consulta: distingue DATOS, OBSERVACIONES y PREGUNTAS. Sin conclusiones médicas. Imprimible (PDF). */
import Link from "next/link";
import { PdfReportCard } from "@/components/diabetes/PdfReport";
import { useMemo, useState } from "react";
import { Card, Icon, Notice } from "@/components/ui";
import { AgpChart, TirBar } from "@/components/charts/glucose";
import { useDiabetes, useLive, useProfile } from "@/lib/db/hooks";
import { all } from "@/lib/db/repo";
import { computeAgp } from "@/lib/domain/cgm/agp";
import { DEFAULT_EPISODE_RULES, detectEpisodes } from "@/lib/domain/cgm/episodes";
import { byTimeBlock, computeMetrics } from "@/lib/domain/cgm/metrics";
import { activityGlucose, observations, summarizeGroups } from "@/lib/domain/cgm/context";
import { formatGlucose } from "@/lib/domain/units";
import { formatDateEs, localDate, minutesOfDay } from "@/lib/domain/time";
import { SPORT_LABEL } from "@/lib/domain/training/endurance";
import { weightTrend } from "@/lib/domain/nutrition/targets";
import { agpPdfReports, readingsBetween } from "@/lib/services/cgm";
import { download, toCsv } from "@/lib/services/data";

export function ReportPage() {
  const p = useProfile();
  const d = useDiabetes();
  const pdfReports = useLive(() => agpPdfReports(), []) ?? [];
  const [days, setDays] = useState(14);
  const [questions, setQuestions] = useState("");
  const ranges = { veryLow: d.veryLow, low: d.targetLow, high: d.targetHigh, veryHigh: d.veryHigh };
  const data = useLive(async () => {
    const all14 = await readingsBetween(0, Date.now() + 864e5);
    const last = all14.length ? Math.max(...all14.map((r) => Date.parse(r.ts))) + 60000 : Date.now();
    const start = last - days * 864e5;
    const rs = all14.filter((r) => Date.parse(r.ts) >= start);
    const endurance = (await all("endurance_sessions")).filter((e) => Date.parse(e.startedAt) >= start);
    const strength = (await all("workout_sessions")).filter((s) => s.status === "completed" && Date.parse(s.startedAt) >= start);
    const logs = (await all("food_logs")).filter((l) => Date.parse(l.eatenAt) >= start);
    const weights = await all("weight_entries");
    const events = (await all("glucose_events")).filter((e) => Date.parse(e.ts) >= start);
    return { rs, start, last, endurance, strength, logs, weights, events };
  }, [days]);
  const calc = useMemo(() => {
    if (!data) return null;
    const rs = data.rs.map((r) => ({ ms: Date.parse(r.ts), mgdl: r.valueMgdl, originalValue: r.originalValue, originalUnit: r.originalUnit }));
    const m = computeMetrics(rs, data.start, data.last, ranges, 15);
    const blocks = byTimeBlock(rs.map((r) => ({ ...r, minuteOfDay: minutesOfDay(r.ms, p.timezone) })), ranges);
    const eps = DEFAULT_EPISODE_RULES.map((rule) => ({ rule, n: detectEpisodes(rs, { ...rule, threshold: rule.id === "hypo1" ? ranges.low : rule.id === "hypo2" ? ranges.veryLow : ranges.veryHigh }).length }));
    const agp = computeAgp(data.rs.map((r) => ({ mgdl: r.valueMgdl, minuteOfDay: minutesOfDay(r.ts, p.timezone) })));
    const acts = activityGlucose(rs.sort((a, b) => a.ms - b.ms), [
      ...data.endurance.map((e) => ({ id: e.id, label: SPORT_LABEL[e.sport], group: SPORT_LABEL[e.sport], start: Date.parse(e.startedAt), end: Date.parse(e.startedAt) + e.durationSec * 1000 })),
      ...data.strength.map((s) => ({ id: s.id, label: "Fuerza", group: "Fuerza", start: Date.parse(s.startedAt), end: s.endedAt ? Date.parse(s.endedAt) : Date.parse(s.startedAt) + 3600000 })),
    ]);
    const obs = observations(summarizeGroups(acts));
    const tr = weightTrend(data.weights.map((w) => ({ date: w.date, weightKg: w.weightKg })));
    const mealDays = new Set(data.logs.map((l) => l.date)).size;
    const carbsPerDay = mealDays ? data.logs.reduce((a, l) => a + l.totals.carbsAvailableG, 0) / mealDays : null;
    return { m, blocks, eps, agp, obs, tr, mealDays, carbsPerDay };
  }, [data, ranges.veryLow, ranges.low, ranges.high, ranges.veryHigh, p.timezone]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || !calc) return <div className="empty-state">Preparando informe…</div>;
  const { m } = calc;
  const g = (v: number | null) => (v == null ? "—" : formatGlucose(v, d.unit));
  const pc = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`);
  const suggestions = [
    calc.obs.length ? "¿Cómo interpretar los cambios de glucosa que veo durante/después de ciertas actividades?" : null,
    m.pctBelow70 > 4 ? "¿Conviene revisar mi plan para los momentos con lecturas por debajo del rango?" : null,
    "¿Qué ajusto (si algo) de mi plan escrito para el ejercicio aeróbico largo y para la fuerza?",
    "¿Mis rangos objetivo actuales siguen siendo los adecuados?",
  ].filter(Boolean) as string[];
  return (
    <div style={{ paddingTop: 18 }}>
      <div className="row between no-print" style={{ marginBottom: 12 }}>
        <Link className="btn sm ghost" href="/progreso"><Icon name="left" />Progreso</Link>
        <div className="row">
          {[14, 30, 90].map((n) => <button key={n} className="chip" aria-pressed={days === n} onClick={() => setDays(n)}>{n} días</button>)}
          <button className="btn sm" onClick={() => download(new Blob(["﻿" + toCsv(data.rs.map((r) => ({ hora_local: r.localTime, utc: r.ts, mg_dl: Math.round(r.valueMgdl), valor_original: r.originalValue, unidad_original: r.originalUnit, tipo: r.kind })))], { type: "text/csv" }), `glucosa-${days}d.csv`)}><Icon name="download" />CSV glucosa</button>
          <button className="btn sm primary" onClick={() => window.print()}><Icon name="printer" />Imprimir / PDF</button>
        </div>
      </div>
      <h1 style={{ margin: "0 0 4px", fontSize: 26 }}>Resumen para la consulta</h1>
      <p className="small muted" style={{ marginTop: 0 }}>{p.displayName || "Paciente"} · periodo {formatDateEs(localDate(data.start, p.timezone), { day: "numeric", month: "long", year: "numeric" })} – {formatDateEs(localDate(data.last - 1, p.timezone), { day: "numeric", month: "long", year: "numeric" })} · generado {new Date().toLocaleString("es-ES")} con NEXO (no es un dispositivo médico).</p>
      <Notice kind="info">Este documento recoge datos importados/registrados y observaciones descriptivas. No contiene conclusiones médicas ni recomendaciones de tratamiento.</Notice>

      <h2 style={{ fontSize: 18, marginTop: 18 }}>1. Datos</h2>
      {pdfReports[0] && <PdfReportCard report={pdfReports[0]} unit={d.unit} />}
      <Card title="Glucosa (MCG importado)" sub={`${d.cgmDevice ?? "Sensor"} · ${m.n} lecturas automáticas · cobertura ${pc(m.coveragePct)} · ${m.gaps.length} huecos > 45 min · rangos ${d.targetsSource === "care_team" ? "indicados por el equipo" : "por defecto (consenso)"}`}>
        {m.n ? (
          <>
            <TirBar pct={m.pct} ranges={ranges} unit={d.unit} />
            <table className="data" style={{ marginTop: 10 }}><tbody>
              <tr><th>Glucosa media</th><td>{g(m.mean)}</td><th>Desviación estándar</th><td>{g(m.sd)}</td></tr>
              <tr><th>Coeficiente de variación</th><td>{pc(m.cv)}</td><th>GMI (estimación)</th><td>{m.gmi != null ? `${m.gmi} %` : `— (${m.gmiReason})`}</td></tr>
              {calc.eps.map((e) => <tr key={e.rule.id}><th colSpan={3}>Episodios: {e.rule.label}</th><td>{e.n}</td></tr>)}
            </tbody></table>
            {m.sufficiencyNotes.map((n) => <p key={n} className="xs" style={{ color: "var(--amber)" }}>{n}</p>)}
            <div style={{ marginTop: 12 }}><AgpChart bins={calc.agp} ranges={ranges} unit={d.unit} height={220} /></div>
            <table className="data" style={{ marginTop: 10 }}>
              <thead><tr><th>Franja</th><th>Media</th><th>En rango</th><th>Bajo</th><th>Alto</th></tr></thead>
              <tbody>{calc.blocks.map((b) => <tr key={b.id}><td>{b.label}</td><td>{b.mean != null ? g(b.mean) : "—"}</td><td>{pc(b.pctIn)}</td><td>{pc(b.pctBelow70)}</td><td>{pc(b.pctAbove180)}</td></tr>)}</tbody>
            </table>
          </>
        ) : <p className="small muted">Sin lecturas individuales en este periodo. Los informes PDF, si existen, se muestran con su propio periodo.</p>}
      </Card>
      <Card title="Actividad">
        <p className="small" style={{ margin: 0 }}>
          {data.strength.length} sesiones de fuerza · {Object.entries(data.endurance.reduce<Record<string, { n: number; min: number; km: number }>>((a, e) => { const k = SPORT_LABEL[e.sport]; a[k] = { n: (a[k]?.n ?? 0) + 1, min: (a[k]?.min ?? 0) + e.durationSec / 60, km: (a[k]?.km ?? 0) + (e.distanceM ?? 0) / 1000 }; return a; }, {})).map(([k, v]) => `${k}: ${v.n} (${Math.round(v.min)} min${v.km ? `, ${v.km.toFixed(1)} km` : ""})`).join(" · ") || "sin actividades de resistencia"}
        </p>
      </Card>
      <Card title="Alimentación y peso">
        <p className="small" style={{ margin: 0 }}>Días con comidas registradas: {calc.mealDays}/{days}{calc.carbsPerDay != null ? ` · hidratos disponibles registrados: ~${Math.round(calc.carbsPerDay)} g/día (estimación sobre lo registrado)` : ""}.
          {calc.tr.length ? ` Peso (tendencia): ${calc.tr.at(-1)!.trend.toLocaleString("es-ES")} kg.` : ""} Eventos anotados: {data.events.length}.</p>
      </Card>

      <h2 style={{ fontSize: 18, marginTop: 18 }}>2. Observaciones descriptivas</h2>
      <Card>
        {calc.obs.length ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{calc.obs.map((o) => <li key={o}>{o}</li>)}</ul> : <p className="small muted" style={{ margin: 0 }}>Sin patrones con datos suficientes (mínimo 3 sesiones similares).</p>}
        <p className="xs dim">Asociaciones temporales en los datos; no implican causalidad.</p>
      </Card>

      <h2 style={{ fontSize: 18, marginTop: 18 }}>3. Preguntas para el equipo (hipótesis del paciente)</h2>
      <Card>
        <ul className="small no-print" style={{ marginTop: 0, paddingLeft: 18 }}>{suggestions.map((s) => <li key={s}><button className="btn sm ghost" onClick={() => setQuestions((q) => (q ? `${q}\n` : "") + `• ${s}`)}>+</button> {s}</li>)}</ul>
        <textarea className="input no-print" style={{ minHeight: 120 }} value={questions} onChange={(e) => setQuestions(e.target.value)} placeholder="Escribe tus preguntas o hipótesis…" aria-label="Preguntas para la consulta" />
        <div className="print-only" style={{ whiteSpace: "pre-wrap" }}>{questions || "—"}</div>
      </Card>
      {d.treatmentDescription && <p className="xs dim">Tratamiento descrito por el paciente: {d.treatmentDescription}</p>}
    </div>
  );
}
