/** Importadores de actividad (TCX/GPX, CSV pasos/sueño) y conexiones. */
import { tbl } from "@/lib/db/db";
import { active, all, nowIso, put } from "@/lib/db/repo";
import type { IntegrationConnection } from "@/lib/db/types";
import { parseActivityFile } from "@/lib/domain/import/activity-files";
import { parseCsv } from "@/lib/domain/csv";
import { localDate } from "@/lib/domain/time";
import { parseNum } from "@/lib/domain/units";
import { autoLinkPlanned } from "./training";

export async function importActivityFile(name: string, text: string, tz: string) {
  const acts = parseActivityFile(name, text);
  let created = 0;
  let skipped = 0;
  for (const a of acts) {
    const dup = (await tbl("endurance_sessions").where("externalId").equals(a.externalId).toArray()).find(active);
    if (dup) { skipped++; continue; }
    const rec = await put("endurance_sessions", {
      sport: a.sport, date: localDate(a.startedAt, tz), startedAt: a.startedAt, durationSec: a.durationSec, distanceM: a.distanceM,
      elevationGainM: a.elevationGainM, avgHr: a.avgHr, maxHr: a.maxHr, rpe: null, avgPowerW: null, indoor: null, treadmillSpeedKmh: null,
      treadmillInclinePct: null, steps: null, sessionType: null, whileWorking: null, shoeId: null, plannedItemId: null,
      title: `${a.format.toUpperCase()} importado`, notes: null, hrZonesSec: null, source: "imported", externalId: a.externalId, importId: null,
    });
    if (a.points.length) await put("activity_streams", { sessionId: rec.id, points: a.points });
    if (a.sport === "run" || a.sport === "bike" || a.sport === "walk") await autoLinkPlanned(a.sport, rec.id, "endurance_sessions", rec.date);
    created++;
  }
  await put("import_jobs", { kind: /\.gpx$/i.test(name) ? "gpx" : "tcx", fileName: name.slice(0, 200), status: "ok", created, skipped, errors: [], importedAt: nowIso() });
  await setConnection("tcx_gpx", { status: "manual", lastSyncAt: nowIso(), lastError: null });
  return { created, skipped };
}

/** CSV genérico: fecha;pasos  o  fecha;horas_sueño */
export async function importDailyCsv(kind: "steps" | "sleep", text: string) {
  const rows = parseCsv(text);
  let created = 0;
  const errors: string[] = [];
  for (const [i, r] of rows.entries()) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(r[0]?.trim()) ? r[0].trim() : null;
    const v = parseNum(r[1]);
    if (!date || v == null) { if (i > 0) errors.push(`fila ${i + 1}`); continue; }
    if (kind === "steps") await put("daily_activity", { id: `steps-${date}`, date, steps: Math.round(v), activeMin: null, source: "imported", externalId: null });
    else await put("sleep_records", { id: `sleep-${date}`, date, durationMin: Math.round(v * 60), quality: null, source: "imported", externalId: null });
    created++;
  }
  await put("import_jobs", { kind: kind === "steps" ? "steps_csv" : "sleep_csv", fileName: null, status: errors.length ? "partial" : "ok", created, skipped: errors.length, errors: errors.slice(0, 20), importedAt: nowIso() });
  return { created, errors };
}

export async function setConnection(provider: IntegrationConnection["provider"], changes: Partial<IntegrationConnection>) {
  const ex = (await all("integration_connections")).find((c) => c.provider === provider);
  if (ex) return put("integration_connections", { ...ex, ...changes });
  return put("integration_connections", { id: provider, provider, status: "disconnected", connectedAt: null, lastSyncAt: null, lastError: null, scopes: [], notes: null, ...changes });
}
