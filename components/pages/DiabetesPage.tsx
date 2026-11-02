"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ActionButton, Card, Empty, Field, Icon, Kpi, Notice, PageHead, SourceBadge, Tabs, Toggle, confirmAction, useTabParam, useToast } from "@/components/ui";
import { AgpChart, GlucoseDayChart, TirBar, type DayEvent } from "@/components/charts/glucose";
import { QuickLog, type QuickKind } from "@/components/log/QuickLog";
import { useDiabetes, useLive, useProfile, useTable } from "@/lib/db/hooks";
import { tbl } from "@/lib/db/db";
import { active, all, nowIso, put } from "@/lib/db/repo";
import { CONSENSUS_GOALS, byTimeBlock, computeMetrics, type Ranges } from "@/lib/domain/cgm/metrics";
import { computeAgp } from "@/lib/domain/cgm/agp";
import { DEFAULT_EPISODE_RULES, detectEpisodes } from "@/lib/domain/cgm/episodes";
import { activityGlucose, mealGlucose, observations, summarizeGroups } from "@/lib/domain/cgm/context";
import { MAX_CSV_BYTES, parseCgmCsv, sha256Hex, type ColumnMap, type DateOrder, type ParseResult } from "@/lib/domain/cgm/parse";
import { isPdf, parseAgpText } from "@/lib/domain/cgm/agp-pdf";
import { formatGlucose } from "@/lib/domain/units";
import { addDays, formatDateEs, localDate, minutesOfDay, startOfLocalDay } from "@/lib/domain/time";
import { SPORT_LABEL, TYPE_LABEL } from "@/lib/domain/training/endurance";
import { deleteImport, deleteRawFile, findImportByHash, readingsBetween, saveCgmImport } from "@/lib/services/cgm";
import { MAX_PDF_BYTES, pdfText } from "@/lib/services/pdf";
import type { CgmReading, GlucoseUnit } from "@/lib/db/types";

const TABS = ["resumen", "dia", "agp", "ejercicio", "eventos", "importar", "protocolo"] as const;
type Tab = (typeof TABS)[number];

const pct = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${v.toLocaleString("es-ES", { maximumFractionDigits: d })} %`);
const toR = (r: CgmReading) => ({ ms: Date.parse(r.ts), mgdl: r.valueMgdl, originalValue: r.originalValue, originalUnit: r.originalUnit });

export function DiabetesPage() {
  const [tab, setTab] = useTabParam<Tab>("resumen", TABS);
  const d = useDiabetes();
  const p = useProfile();
  const [days, setDays] = useState(14);
  const [quick, setQuick] = useState<QuickKind>(null);
  const last = useLive(async () => (await tbl("cgm_readings").orderBy("ts").reverse().filter((x) => active(x) && x.kind === "historic").first()) ?? null, []);
  const ranges: Ranges = { veryLow: d.veryLow, low: d.targetLow, high: d.targetHigh, veryHigh: d.veryHigh };
  const endMs = last ? Date.parse(last.ts) + 60000 : Date.now();
  const startMs = endMs - days * 864e5;
  const readings = useLive(() => readingsBetween(startMs - 864e5 * days, endMs), [startMs, endMs, days]);
  const ageH = last ? (Date.now() - Date.parse(last.ts)) / 36e5 : null;
  return (
    <>
      <PageHead eyebrow="Diabetes tipo 1 · datos CGM" title="Glucosa: descriptivo y retrospectivo"
        actions={<button className="btn" onClick={() => setQuick("glucose")}><Icon name="plus" />Glucemia o evento</button>}>
        Análisis de datos importados para entender patrones y preparar tus consultas. No es un monitor en tiempo real ni sustituye al lector o la app oficial, y nunca sugiere dosis.
      </PageHead>
      <Notice kind={ageH != null && ageH < 24 ? "info" : "warn"} icon="clock">
        {last ? <>Último dato importado: <b>{new Date(last.ts).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}</b> ({ageH! < 48 ? `hace ${Math.round(ageH!)} h` : `hace ${Math.round(ageH! / 24)} días`}). <b>No es tiempo real</b>: puede haber retrasos y huecos.</> : <>Aún no hay datos de glucosa. <Link href="/diabetes?tab=importar">Importa tu CSV de LibreView</Link>.</>}
      </Notice>
      <Tabs label="Diabetes" value={tab} onChange={setTab} tabs={[
        { id: "resumen", label: "Resumen" }, { id: "dia", label: "Día" }, { id: "agp", label: "AGP" }, { id: "ejercicio", label: "Actividad y comidas" },
        { id: "eventos", label: "Eventos" }, { id: "importar", label: "Importar" }, { id: "protocolo", label: "Mi protocolo" },
      ]} />
      {["resumen", "agp", "ejercicio"].includes(tab) && (
        <div className="row" style={{ marginBottom: 10 }} role="group" aria-label="Periodo">
          {[7, 14, 30, 90].map((n) => <button key={n} className="chip" aria-pressed={days === n} onClick={() => setDays(n)}>{n} días</button>)}
        </div>
      )}
      {tab === "resumen" && <Summary readings={readings} startMs={startMs} endMs={endMs} days={days} ranges={ranges} unit={d.unit} tz={p.timezone} />}
      {tab === "dia" && <DayView ranges={ranges} unit={d.unit} tz={p.timezone} lastDate={last ? localDate(last.ts, p.timezone) : localDate()} />}
      {tab === "agp" && <AgpView readings={readings} startMs={startMs} endMs={endMs} ranges={ranges} unit={d.unit} tz={p.timezone} />}
      {tab === "ejercicio" && <ContextView readings={readings} startMs={startMs} endMs={endMs} unit={d.unit} />}
      {tab === "eventos" && <EventsView unit={d.unit} onAdd={() => setQuick("glucose")} />}
      {tab === "importar" && <ImportView tz={p.timezone} />}
      {tab === "protocolo" && <ProtocolView />}
      <QuickLog kind={quick} onClose={() => setQuick(null)} />
    </>
  );
}

function Summary({ readings, startMs, endMs, days, ranges, unit, tz }: { readings?: CgmReading[]; startMs: number; endMs: number; days: number; ranges: Ranges; unit: GlucoseUnit; tz: string }) {
  const toast = useToast();
  const data = useMemo(() => {
    if (!readings) return null;
    const rs = readings.map(toR);
    const cur = computeMetrics(rs, startMs, endMs, ranges, 15);
    const prev = computeMetrics(rs, startMs - days * 864e5, startMs, ranges, 15);
    const inPeriod = rs.filter((r) => r.ms >= startMs && r.ms < endMs);
    const blocks = byTimeBlock(inPeriod.map((r) => ({ ...r, minuteOfDay: minutesOfDay(r.ms, tz) })), ranges);
    const episodes = DEFAULT_EPISODE_RULES.map((rule) => ({ rule, list: detectEpisodes(inPeriod, { ...rule, threshold: rule.id === "hypo1" ? ranges.low : rule.id === "hypo2" ? ranges.veryLow : ranges.veryHigh }) }));
    return { cur, prev, blocks, episodes };
  }, [readings, startMs, endMs, days, ranges, tz]);
  if (!data) return <div className="empty-state">Cargando…</div>;
  const { cur, prev, blocks, episodes } = data;
  if (!cur.n) return <Empty title="Sin lecturas en este periodo" action={<Link className="btn primary" href="/diabetes?tab=importar">Importar datos</Link>} />;
  const delta = (a: number | null, b: number | null) => (a == null || b == null || !prev.n ? "" : ` (${a - b >= 0 ? "+" : ""}${(a - b).toLocaleString("es-ES", { maximumFractionDigits: 1 })})`);
  return (
    <div className="stack">
      <Card title="Calidad de los datos" right={<SourceBadge source="imported" />}>
        <div className="grid g4">
          <Kpi value={`${cur.days.toLocaleString("es-ES", { maximumFractionDigits: 1 })} días`} label={`${formatDateEs(localDate(startMs, tz))} – ${formatDateEs(localDate(endMs - 1, tz))}`} />
          <Kpi value={pct(cur.coveragePct, 0)} label={`cobertura (${cur.n} lecturas cada ${cur.intervalMin} min)`} />
          <Kpi value={cur.gaps.length} label="huecos > 45 min" />
          <Kpi value={unit} label="unidad de visualización" />
        </div>
        {cur.sufficiencyNotes.map((n) => <Notice key={n} kind="warn">{n} Las cifras se muestran, pero no representan un perfil completo.</Notice>)}
      </Card>
      <Card title="Tiempo en rangos" sub={`Rangos ${ranges.low === 70 && ranges.high === 180 ? "por defecto (consenso)" : "configurados por ti"} · lecturas automáticas del sensor`} right={<SourceBadge source="calculated" />}>
        <TirBar pct={cur.pct} ranges={ranges} unit={unit} />
        {prev.n > 0 && <p className="xs dim" style={{ marginTop: 8 }}>Periodo anterior equivalente: en rango {pct(prev.pct.in)}, &lt; {formatGlucose(ranges.low, unit, false)} {pct(prev.pctBelow70)}, &gt; {formatGlucose(ranges.high, unit, false)} {pct(prev.pctAbove180)} (cobertura {pct(prev.coveragePct, 0)}).</p>}
      </Card>
      <div className="grid g4">
        <Kpi value={cur.mean != null ? formatGlucose(cur.mean, unit) : "—"} label={`glucosa media${delta(cur.mean, prev.mean)}`} source="calculated" />
        <Kpi value={cur.sd != null ? formatGlucose(cur.sd, unit) : "—"} label="desviación estándar" source="calculated" />
        <Kpi value={pct(cur.cv)} label={`coeficiente de variación${delta(cur.cv, prev.cv)}`} source="calculated" />
        <Kpi value={cur.gmi != null ? `${cur.gmi.toLocaleString("es-ES")} %` : "—"} label={cur.gmi != null ? "GMI (estimación, no HbA1c)" : cur.gmiReason ?? ""} source="estimated" />
      </div>
      <Card title="Por franja horaria">
        <table className="data">
          <thead><tr><th>Franja</th><th>Lecturas</th><th>Media</th><th>En rango</th><th>Bajo</th><th>Alto</th></tr></thead>
          <tbody>{blocks.map((b) => <tr key={b.id}><td>{b.label}</td><td>{b.n}</td><td>{b.mean != null ? formatGlucose(b.mean, unit, false) : "—"}</td><td>{pct(b.pctIn, 0)}</td><td>{pct(b.pctBelow70, 0)}</td><td>{pct(b.pctAbove180, 0)}</td></tr>)}</tbody>
        </table>
      </Card>
      <Card title="Episodios (reglas configurables, no diagnóstico)">
        {episodes.map(({ rule, list }) => (
          <details key={rule.id} className="small">
            <summary><b>{list.length}</b> · {rule.label.replace(/\d+ mg\/dL/, (m) => (rule.id === "hypo1" ? formatGlucose(ranges.low, unit) : rule.id === "hypo2" ? formatGlucose(ranges.veryLow, unit) : formatGlucose(ranges.veryHigh, unit)) || m)}</summary>
            <ul>{list.slice(0, 30).map((e) => <li key={e.start}>{new Date(e.start).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })} · {e.minutes} min · {rule.type === "below" ? "mínimo" : "máximo"} {formatGlucose(e.extreme, unit)}</li>)}</ul>
          </details>
        ))}
        <p className="xs dim">Inicio: ≥ 15 min (≥ 120 min en hiperglucemia prolongada) consecutivos; fin: ≥ 15 min fuera. Los huecos &gt; 45 min cortan el episodio.</p>
      </Card>
      <Card title="Referencias generales del consenso internacional" sub="Contexto, no objetivos personales: tus objetivos los define tu equipo.">
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{CONSENSUS_GOALS.map((g) => <li key={g.key}>{g.label}: {g.goal}</li>)}</ul>
        <p className="xs dim">Battelino et al., Diabetes Care 2019. Consultado 2026-11-01.</p>
      </Card>
      <button className="btn ghost" onClick={async () => {
        await put("cgm_metric_periods", { periodStart: new Date(startMs).toISOString(), periodEnd: new Date(endMs).toISOString(), label: `${days} días hasta ${localDate(endMs - 1, tz)}`, computedAt: nowIso(), version: "metrics-1",
          metrics: { tir: cur.pct.in, tbr: cur.pctBelow70, tbr54: cur.pct.vlow, tar: cur.pctAbove180, tar250: cur.pct.vhigh, mean: cur.mean, cv: cur.cv, gmi: cur.gmi, coverage: cur.coveragePct, days: cur.days } });
        toast("Instantánea guardada para comparar");
      }}>Guardar instantánea del periodo</button>
    </div>
  );
}

function DayView({ ranges, unit, tz, lastDate }: { ranges: Ranges; unit: GlucoseUnit; tz: string; lastDate: string }) {
  const [date, setDate] = useState(lastDate);
  const dayStart = startOfLocalDay(date, tz);
  const dayEnd = startOfLocalDay(addDays(date, 1), tz);
  const data = useLive(async () => {
    const rs = await readingsBetween(dayStart, dayEnd, ["historic", "scan"]);
    const hist = rs.filter((r) => r.kind === "historic").map((r) => ({ ms: Date.parse(r.ts), mgdl: r.valueMgdl }));
    const isoA = new Date(dayStart).toISOString();
    const isoB = new Date(dayEnd).toISOString();
    const evs = (await tbl("glucose_events").where("ts").between(isoA, isoB).toArray()).filter(active);
    const meals = (await tbl("food_logs").where("date").equals(date).toArray()).filter(active);
    const end = (await tbl("endurance_sessions").where("date").equals(date).toArray()).filter(active);
    const str = (await tbl("workout_sessions").where("date").equals(date).toArray()).filter((s) => active(s) && s.status === "completed");
    const events: DayEvent[] = [
      ...meals.map((m) => ({ ts: Date.parse(m.eatenAt), kind: "meal" as const, label: `${m.title} · ${Math.round(m.totals.carbsAvailableG)} g hidratos` })),
      ...evs.map((e) => ({ ts: Date.parse(e.ts), kind: (e.kind === "meal" ? "meal" : e.kind === "insulin" ? "insulin" : e.kind === "exercise" ? "exercise" : "note") as DayEvent["kind"], label: `${e.kind === "insulin" ? `${e.value ?? "?"} U ${e.insulinType === "long" ? "lenta" : "rápida"} (registro)` : e.kind === "meal" ? `${e.value ?? "?"} g hidratos` : e.kind === "fingerstick" && e.value ? `capilar ${formatGlucose(e.value, unit)}` : e.kind}${e.note ? ` · ${e.note}` : ""}` })),
      ...end.map((e) => ({ ts: Date.parse(e.startedAt), end: Date.parse(e.startedAt) + e.durationSec * 1000, kind: "exercise" as const, label: `${SPORT_LABEL[e.sport]}${e.sessionType ? ` ${TYPE_LABEL[e.sessionType].toLowerCase()}` : ""} ${Math.round(e.durationSec / 60)} min` })),
      ...str.map((s) => ({ ts: Date.parse(s.startedAt), end: s.endedAt ? Date.parse(s.endedAt) : Date.parse(s.startedAt) + (s.durationMin ?? 60) * 60000, kind: "exercise" as const, label: `Fuerza: ${s.title}` })),
    ].sort((a, b) => a.ts - b.ts);
    return { hist, events, scans: rs.length - hist.length };
  }, [dayStart, dayEnd, date]);
  const m = data ? computeMetrics(data.hist, dayStart, dayEnd, ranges, 15) : null;
  return (
    <div className="stack">
      <div className="row">
        <button className="icon-btn" aria-label="Día anterior" onClick={() => setDate(addDays(date, -1))}><Icon name="left" /></button>
        <input type="date" className="input" style={{ maxWidth: 180 }} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Fecha" />
        <button className="icon-btn" aria-label="Día siguiente" onClick={() => setDate(addDays(date, 1))}><Icon name="right" /></button>
      </div>
      <Card title={formatDateEs(date, { weekday: "long", day: "numeric", month: "long" })} sub={m && m.n ? `${m.n} lecturas · cobertura ${pct(m.coveragePct, 0)} · en rango ${pct(m.pct.in, 0)} · media ${m.mean ? formatGlucose(m.mean, unit) : "—"}` : "Sin lecturas este día"}>
        {data && data.hist.length ? <GlucoseDayChart readings={data.hist} events={data.events} dayStart={dayStart} ranges={ranges} unit={unit} /> : <Empty title="Sin datos de glucosa este día" />}
      </Card>
      <p className="xs dim">Superposición cronológica de datos importados y registros. Sirve para observar, no para decidir tratamiento.</p>
    </div>
  );
}

function AgpView({ readings, startMs, endMs, ranges, unit, tz }: { readings?: CgmReading[]; startMs: number; endMs: number; ranges: Ranges; unit: GlucoseUnit; tz: string }) {
  const res = useMemo(() => {
    if (!readings) return null;
    const rs = readings.filter((r) => { const t = Date.parse(r.ts); return t >= startMs && t < endMs; });
    return { bins: computeAgp(rs.map((r) => ({ mgdl: r.valueMgdl, minuteOfDay: minutesOfDay(r.ts, tz) }))), m: computeMetrics(rs.map(toR), startMs, endMs, ranges, 15) };
  }, [readings, startMs, endMs, ranges, tz]);
  if (!res) return null;
  return (
    <Card title="Perfil ambulatorio de glucosa (AGP)" sub={`${res.m.n} lecturas · cobertura ${pct(res.m.coveragePct, 0)}`} right={<SourceBadge source="calculated" />}>
      {res.m.days < 14 && <Notice kind="warn">Con menos de 14 días el AGP es poco representativo.</Notice>}
      <AgpChart bins={res.bins} ranges={ranges} unit={unit} />
    </Card>
  );
}

function ContextView({ readings, startMs, endMs, unit }: { readings?: CgmReading[]; startMs: number; endMs: number; unit: GlucoseUnit }) {
  const acts = useLive(async () => {
    const e = (await all("endurance_sessions")).filter((x) => { const t = Date.parse(x.startedAt); return t >= startMs && t < endMs; });
    const w = (await all("workout_sessions")).filter((x) => x.status === "completed" && Date.parse(x.startedAt) >= startMs && Date.parse(x.startedAt) < endMs);
    const meals = (await all("food_logs")).filter((x) => { const t = Date.parse(x.eatenAt); return t >= startMs && t < endMs; });
    return {
      acts: [
        ...e.map((x) => ({ id: x.id, label: `${SPORT_LABEL[x.sport]} ${formatDateEs(x.date)}`, group: `${SPORT_LABEL[x.sport]}${x.rpe != null ? (x.rpe >= 7 ? " intensa" : " suave/moderada") : ""}`, start: Date.parse(x.startedAt), end: Date.parse(x.startedAt) + x.durationSec * 1000 })),
        ...w.map((x) => ({ id: x.id, label: `Fuerza ${formatDateEs(x.date)}`, group: "Fuerza", start: Date.parse(x.startedAt), end: x.endedAt ? Date.parse(x.endedAt) : Date.parse(x.startedAt) + (x.durationMin ?? 60) * 60000 })),
      ],
      meals: meals.map((m) => ({ id: m.id, label: m.title, ts: Date.parse(m.eatenAt), carbsG: m.totals.carbsAvailableG })),
    };
  }, [startMs, endMs]);
  const rs = useMemo(() => (readings ?? []).filter((r) => r.kind === "historic").map((r) => ({ ms: Date.parse(r.ts), mgdl: r.valueMgdl })).sort((a, b) => a.ms - b.ms), [readings]);
  if (!acts) return null;
  const rows = activityGlucose(rs, acts.acts);
  const groups = summarizeGroups(rows);
  const obs = observations(groups);
  const meals = mealGlucose(rs, acts.meals).filter((m) => m.atMeal != null);
  const g = (v: number | null) => (v == null ? "—" : formatGlucose(v, unit, false));
  return (
    <div className="stack">
      <Notice kind="info" icon="shield">Observaciones retrospectivas para revisar con tu equipo. No predicen tu respuesta, no indican causas y no sugieren cambios de insulina.</Notice>
      <Card title="Observaciones">
        {obs.length ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{obs.map((o) => <li key={o}>{o}</li>)}</ul> : <p className="small muted">Se necesitan al menos 3 sesiones del mismo tipo con datos de glucosa antes, durante y después.</p>}
      </Card>
      <Card title="Actividad ↔ glucosa">
        {rows.length ? (
          <div className="scroll-x">
            <table className="data">
              <thead><tr><th>Actividad</th><th>Inicio</th><th>Final</th><th>Cambio</th><th>Mín. durante</th><th>Mín. 24 h después</th><th>Datos</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}><td>{r.label}</td><td>{g(r.atStart)}</td><td>{g(r.atEnd)}</td><td>{r.delta != null ? `${r.delta > 0 ? "+" : ""}${g(r.delta)}` : "—"}</td><td>{g(r.minDuring)}{r.below70During ? " ▼" : ""}</td><td>{g(r.min24hAfter)}{r.below70After24h ? " ▼" : ""}</td><td>{r.coverageOk ? "OK" : "Insuficientes"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty title="Sin actividades en el periodo" />}
        <p className="xs dim">▼ = hubo alguna lectura por debajo de 70 mg/dL. Unidad: {unit}.</p>
      </Card>
      <Card title="Comidas ↔ glucosa (0–3 h)">
        {meals.length ? (
          <table className="data">
            <thead><tr><th>Comida</th><th>Hidratos</th><th>Al comer</th><th>Pico</th><th>Subida</th><th>Min. al pico</th></tr></thead>
            <tbody>{meals.slice(0, 40).map((m) => <tr key={m.id}><td>{m.label}<div className="xs dim">{new Date(m.ts).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</div></td><td>{m.carbsG != null ? `${Math.round(m.carbsG)} g` : "—"}</td><td>{g(m.atMeal)}</td><td>{g(m.peak)}</td><td>{m.rise != null ? g(m.rise) : "—"}</td><td>{m.peakMinutes ?? "—"}</td></tr>)}</tbody>
          </table>
        ) : <p className="small muted">Registra la hora de tus comidas para ver su contexto glucémico.</p>}
      </Card>
    </div>
  );
}

function EventsView({ unit, onAdd }: { unit: GlucoseUnit; onAdd: () => void }) {
  const evs = useLive(async () => (await all("glucose_events")).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 100), []) ?? [];
  const LABEL: Record<string, string> = { meal: "Comida", exercise: "Ejercicio", sleep: "Sueño", illness: "Enfermedad", stress: "Estrés", alcohol: "Alcohol", medication: "Medicación", insulin: "Insulina (registro)", fingerstick: "Capilar", hypo_treatment: "Tratamiento hipo (registro)", note: "Nota", other: "Otro" };
  return (
    <Card title="Eventos anotados" right={<button className="btn sm" onClick={onAdd}><Icon name="plus" />Añadir</button>}>
      {evs.length ? (
        <div className="list">
          {evs.map((e) => (
            <div className="li" key={e.id}>
              <div className="grow">
                <div className="t">{LABEL[e.kind]}{e.value != null ? ` · ${e.kind === "fingerstick" ? formatGlucose(e.value, unit) : `${e.value} ${e.unit ?? ""}`}` : ""}</div>
                <div className="s">{new Date(e.ts).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}{e.note ? ` · ${e.note}` : ""}</div>
              </div>
              <SourceBadge source={e.source} />
            </div>
          ))}
        </div>
      ) : <Empty title="Sin eventos">Anota comidas, ejercicio, enfermedad, estrés o alcohol para dar contexto a tus datos.</Empty>}
    </Card>
  );
}

function ImportView({ tz }: { tz: string }) {
  const toast = useToast();
  const imports = useLive(async () => (await all("cgm_imports")).sort((a, b) => b.importedAt.localeCompare(a.importedAt)), []) ?? [];
  const [file, setFile] = useState<{ name: string; size: number; bytes: ArrayBuffer; text: string; hash: string } | null>(null);
  const [zone, setZone] = useState(tz);
  const [order, setOrder] = useState<DateOrder | "">("");
  const [keepRaw, setKeepRaw] = useState(true);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [mapUnit, setMapUnit] = useState<GlucoseUnit>("mg/dL");
  const [pdf, setPdf] = useState<ReturnType<typeof parseAgpText> | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => (file ? parseCgmCsv(file.text, { timezone: zone, dateOrder: order || undefined, map: map ?? undefined, unit: map ? mapUnit : undefined }) : null), [file, zone, order, map, mapUnit]);
  const onFile = async (f?: File) => {
    setPdf(null);
    setFile(null);
    setMap(null);
    if (!f) return;
    const bytes = await f.arrayBuffer();
    const head = new Uint8Array(bytes.slice(0, 5));
    if (isPdf(head)) {
      if (bytes.byteLength > MAX_PDF_BYTES) return toast("PDF demasiado grande (máx. 10 MB)");
      try { setPdf(parseAgpText(await pdfText(bytes))); } catch { toast("No se pudo leer el PDF"); }
      return;
    }
    if (bytes.byteLength > MAX_CSV_BYTES) return toast("CSV demasiado grande (máx. 20 MB)");
    const text = new TextDecoder("utf-8").decode(bytes);
    const hash = await sha256Hex(bytes);
    if (await findImportByHash(hash)) toast("Este archivo ya se importó: solo se añadirán lecturas nuevas (si las hay).");
    setFile({ name: f.name, size: f.size, bytes, text, hash });
  };
  const ok = parsed && !("error" in parsed) ? (parsed as ParseResult) : null;
  return (
    <div className="stack">
      <Card title="Importar datos de LibreView" sub="En libreview.com: Informes/Descargar datos de glucosa (CSV). La disponibilidad y el formato pueden variar según país y cuenta.">
        <ol className="small" style={{ marginTop: 0 }}>
          <li>Descarga el CSV desde LibreView (no lo abras ni lo guardes con Excel antes: puede cambiar el formato).</li>
          <li>Selecciónalo aquí: se procesa en este dispositivo.</li>
          <li>Revisa periodo, unidad, orden de fecha y avisos, y confirma.</li>
        </ol>
        <input type="file" accept=".csv,text/csv,.txt,application/pdf,.pdf" onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Archivo CSV o PDF" />
        <p className="xs dim">Nunca pedimos tu usuario ni contraseña de LibreView/LibreLink. PDF AGP: extracción experimental solo de métricas resumidas.</p>
      </Card>
      {pdf && (
        <Card title="Informe PDF (métricas resumidas)" right={<span className="badge warn">Experimental</span>}>
          {pdf.found.length ? (
            <>
              <table className="data"><tbody>
                {pdf.periodText && <tr><th>Periodo</th><td>{pdf.periodText}</td></tr>}
                {pdf.pctInRange != null && <tr><th>En rango</th><td>{pdf.pctInRange} %</td></tr>}
                {pdf.pctLow != null && <tr><th>Bajo</th><td>{pdf.pctLow} %</td></tr>}
                {pdf.pctVeryLow != null && <tr><th>Muy bajo</th><td>{pdf.pctVeryLow} %</td></tr>}
                {pdf.pctHigh != null && <tr><th>Alto</th><td>{pdf.pctHigh} %</td></tr>}
                {pdf.pctVeryHigh != null && <tr><th>Muy alto</th><td>{pdf.pctVeryHigh} %</td></tr>}
                {pdf.meanMgdl != null && <tr><th>Glucosa media</th><td>{pdf.meanMgdl} mg/dL</td></tr>}
                {pdf.gmi != null && <tr><th>GMI</th><td>{pdf.gmi} %</td></tr>}
                {pdf.cv != null && <tr><th>Variabilidad (CV)</th><td>{pdf.cv} %</td></tr>}
                {pdf.activePct != null && <tr><th>Sensor activo</th><td>{pdf.activePct} %</td></tr>}
              </tbody></table>
              <button className="btn primary" style={{ marginTop: 10 }} onClick={async () => {
                await put("cgm_imports", { fileName: "Informe AGP (PDF)", fileSize: 0, fileHash: `pdf-${Date.now()}`, format: "agp_pdf", parserVersion: "agp-pdf-1.0", importedAt: nowIso(), periodStart: null, periodEnd: null, readingsCount: 0, duplicatesSkipped: 0, rowsRejected: 0, unit: "mg/dL", timezone: tz, warnings: ["Solo métricas agregadas extraídas de texto; verifica con el informe original."], rawStored: false, reportSummary: Object.fromEntries(Object.entries(pdf).filter(([k]) => k !== "found")) as Record<string, number | string> });
                toast("Resumen del informe guardado");
                setPdf(null);
              }}>Guardar resumen</button>
            </>
          ) : <Notice kind="warn">No se reconocieron métricas en el PDF. Usa el CSV.</Notice>}
        </Card>
      )}
      {file && parsed && "error" in parsed && (
        <Card title="Mapeo manual de columnas" sub={parsed.error}>
          <div className="grid g3">
            <Field label="Columna de fecha/hora"><select value={map?.time ?? ""} onChange={(e) => setMap({ ...(map ?? { time: 0 }), time: Number(e.target.value) })}><option value="">—</option>{parsed.headers.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}</select></Field>
            <Field label="Columna de glucosa"><select value={map?.historic ?? ""} onChange={(e) => setMap({ ...(map ?? { time: 0 }), historic: Number(e.target.value) })}><option value="">—</option>{parsed.headers.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}</select></Field>
            <Field label="Unidad"><select value={mapUnit} onChange={(e) => setMapUnit(e.target.value as GlucoseUnit)}><option>mg/dL</option><option>mmol/L</option></select></Field>
          </div>
          <div className="scroll-x" style={{ marginTop: 8 }}><table className="data"><tbody>{parsed.rows.slice(0, 5).map((r, i) => <tr key={i}>{r.slice(0, 8).map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>
        </Card>
      )}
      {file && ok && (
        <Card title={`Vista previa: ${file.name}`} sub={`${ok.format === "libreview_csv" ? "Formato LibreView detectado" : "CSV genérico"} · ${ok.unit}${ok.device ? ` · ${ok.device}` : ""}`}>
          <div className="grid g4">
            <Kpi value={ok.readings.filter((r) => r.kind === "historic").length} label="lecturas automáticas" />
            <Kpi value={ok.readings.filter((r) => r.kind !== "historic").length} label="escaneos / capilares" />
            <Kpi value={ok.events.length} label="eventos (insulina, comida, notas)" />
            <Kpi value={ok.rejected.length + ok.duplicatesInFile} label="filas descartadas o duplicadas" />
          </div>
          {ok.readings.length > 0 && <p className="small">Periodo: {new Date(ok.readings[0].ms).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })} → {new Date(ok.readings.at(-1)!.ms).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}</p>}
          <div className="grid g3">
            <Field label="Zona horaria del lector"><input value={zone} onChange={(e) => setZone(e.target.value)} /></Field>
            <Field label="Orden de la fecha" hint={ok.dateOrderGuessed ? "Deducido del idioma: compruébalo" : "Deducido de los datos"}>
              <select value={order || ok.dateOrder} onChange={(e) => setOrder(e.target.value as DateOrder)}><option value="DMY">día-mes-año</option><option value="MDY">mes-día-año</option><option value="YMD">año-mes-día</option></select>
            </Field>
            <Toggle checked={keepRaw} onChange={setKeepRaw} label="Guardar el archivo original cifrado" hint="Solo en este dispositivo. Puedes borrarlo después." />
          </div>
          {ok.warnings.map((w) => <Notice key={w} kind="warn">{w}</Notice>)}
          {ok.rejected.length > 0 && <details className="small"><summary>Filas descartadas ({ok.rejected.length})</summary><ul>{ok.rejected.slice(0, 15).map((r) => <li key={r.line}>Línea {r.line}: {r.reason}</li>)}</ul></details>}
          {ok.events.some((e) => e.kind === "insulin") && <Notice kind="info">Los registros de insulina del archivo se guardan solo como <b>dato histórico</b>. La app nunca los usa para calcular nada.</Notice>}
          <div className="row" style={{ marginTop: 10 }}>
            <ActionButton className="btn primary" busyLabel="Importando…" disabled={busy || !ok.readings.length} onRun={async () => {
              setBusy(true);
              try {
                const r = await saveCgmImport(ok, { name: file.name, size: file.size, hash: file.hash, bytes: file.bytes, keepRaw, timezone: zone });
                setFile(null);
                return `${r.created} lecturas nuevas · ${r.duplicates} ya existían · ${r.events} eventos`;
              } finally { setBusy(false); }
            }} success={(m) => m}>Confirmar importación</ActionButton>
            <button className="btn ghost" onClick={() => setFile(null)}>Cancelar</button>
          </div>
        </Card>
      )}
      <Card title="Importaciones">
        {imports.length ? (
          <div className="list">
            {imports.map((i) => (
              <div className="li" key={i.id}>
                <div className="grow">
                  <div className="t">{i.fileName}</div>
                  <div className="s">{i.importedAt.slice(0, 16).replace("T", " ")} · {i.format} · {i.readingsCount} lecturas · {i.duplicatesSkipped} duplicadas · {i.rowsRejected} descartadas · {i.unit} · {i.timezone} · parser {i.parserVersion}</div>
                  {i.periodStart && <div className="xs dim">{i.periodStart.slice(0, 10)} → {i.periodEnd?.slice(0, 10)}</div>}
                </div>
                {i.rawStored && <button className="btn sm ghost" onClick={async () => { await deleteRawFile(i.id); toast("Original borrado"); }}>Borrar original</button>}
                <button className="icon-btn" aria-label="Borrar importación" onClick={async () => { if (confirmAction("¿Borrar esta importación y sus lecturas?")) { await deleteImport(i.id); toast("Importación borrada"); } }}><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        ) : <p className="small muted">Ninguna todavía.</p>}
      </Card>
    </div>
  );
}

function ProtocolView() {
  const d = useDiabetes();
  return (
    <div className="stack">
      <Card title="Si es una emergencia" className="">
        <p style={{ margin: 0 }}>Sigue tu plan de emergencia y <a href="tel:112"><b>llama al 112</b></a>.</p>
        {d.emergencyContacts && <p className="small" style={{ marginBottom: 0 }}>Contactos: {d.emergencyContacts}</p>}
      </Card>
      <Card title="Mi protocolo personal" sub={d.protocolSource ? `Fuente: ${d.protocolSource}${d.protocolUpdatedAt ? ` · ${d.protocolUpdatedAt.slice(0, 10)}` : ""}` : "Introducido por ti desde las indicaciones de tu equipo sanitario"}>
        {d.protocolText ? <div style={{ whiteSpace: "pre-wrap" }}>{d.protocolText}</div> : <Empty title="Sin protocolo guardado" action={<Link className="btn" href="/ajustes?tab=diabetes">Añadir en Ajustes</Link>}>Copia aquí las pautas escritas que te haya dado tu equipo (ejercicio, hipoglucemia, días de enfermedad). La app no genera protocolos.</Empty>}
      </Card>
    </div>
  );
}
