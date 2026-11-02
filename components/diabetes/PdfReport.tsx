"use client";
import { useState } from "react";
import { ActionButton, Card, Field, Kpi, Notice, SourceBadge } from "@/components/ui";
import type { CgmImport, GlucoseUnit } from "@/lib/db/types";
import { formatGlucose } from "@/lib/domain/units";
import { formatDateEs } from "@/lib/domain/time";
import { download } from "@/lib/services/data";
import { originalPdf } from "@/lib/services/cgm";

type Summary = Record<string, number | string>;
const value = (s: Summary, key: string): number | null => typeof s[key] === "number" && Number.isFinite(s[key]) ? s[key] as number : null;
const pct = (n: number | null) => n == null ? "No consta" : `${n.toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
export function PdfReportMetrics({ summary: s, unit = "mg/dL" }: { summary: Summary; unit?: GlucoseUnit }) {
  const mean = value(s, "meanMgdl");
  const low = value(s, "rangeLowMgdl"), high = value(s, "rangeHighMgdl");
  const veryLow = value(s, "veryLowMgdl"), veryHigh = value(s, "veryHighMgdl");
  return <>
    <p className="small"><b>Periodo del informe:</b> {s.periodStartDate && s.periodEndDate ? `${formatDateEs(String(s.periodStartDate))} – ${formatDateEs(String(s.periodEndDate))}` : s.periodText || "No reconocido"}</p>
    <div className="grid g3">
      <Kpi value={mean == null ? "No consta" : formatGlucose(mean, unit)} label="glucosa media del informe" source="imported" />
      <Kpi value={pct(value(s, "pctInRange"))} label="tiempo en rango del informe" source="imported" />
      <Kpi value={pct(value(s, "activePct"))} label="tiempo con sensor activo" source="imported" />
    </div>
    <table className="data" style={{ marginTop: 12 }}><tbody>
      {([ ["pctVeryHigh", `Muy alto${veryHigh == null ? "" : ` (> ${formatGlucose(veryHigh, unit)})`}`], ["pctHigh", "Alto"], ["pctInRange", `En rango${low == null || high == null ? "" : ` (${formatGlucose(low, unit, false)}–${formatGlucose(high, unit)})`}`], ["pctLow", "Bajo"], ["pctVeryLow", `Muy bajo${veryLow == null ? "" : ` (< ${formatGlucose(veryLow, unit)})`}`], ["gmi", "GMI del informe"], ["cv", "Variabilidad (CV)"] ] as const).map(([key, label]) => <tr key={key}><th>{label}</th><td>{pct(value(s, key))}</td></tr>)}
    </tbody></table>
    <p className="xs dim">Valores publicados en el PDF, con sus propios rangos y periodo. No se recalculan con los rangos de Ajustes. «No consta» significa que no se pudo extraer ese dato.</p>
  </>;
}

export function PdfReportCard({ report, unit }: { report: CgmImport; unit: GlucoseUnit }) {
  return <Card title="Informe de glucosa importado (PDF)" right={<SourceBadge source="imported" />}>
    <PdfReportMetrics summary={report.reportSummary ?? {}} unit={unit} />
    <Notice kind="info">Este PDF aporta métricas resumidas. Las gráficas y los máximos/mínimos por hora no son lecturas individuales: no se calculan nuevos episodios ni cruces con comidas o actividad a partir de ellas.</Notice>
    {report.warnings.filter((w) => !w.startsWith("Métricas del informe PDF:")).map((w) => <p className="small" key={w}>{w}</p>)}
    {report.rawStored && <ActionButton className="btn sm ghost no-print" onRun={async () => download(await originalPdf(report.id), report.fileName)} success="PDF preparado">Descargar PDF original</ActionButton>}
  </Card>;
}

export function PdfReports({ reports, unit }: { reports: CgmImport[]; unit: GlucoseUnit }) {
  const [selected, setSelected] = useState("");
  const report = reports.find((r) => r.id === selected) ?? reports[0];
  if (!report) return null;
  return <section className="stack" style={{ marginBottom: 16 }} aria-label="Informes PDF de glucosa">
    {reports.length > 1 && <Field label="Informe PDF"><select value={report.id} onChange={(e) => setSelected(e.target.value)}>{reports.map((r) => <option key={r.id} value={r.id}>{r.reportSummary?.periodText ?? "Sin periodo reconocido"} · {r.fileName}</option>)}</select></Field>}
    <PdfReportCard report={report} unit={unit} />
  </section>;
}
