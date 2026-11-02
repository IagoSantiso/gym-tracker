/** Importación y consulta de datos CGM (local). */
import { getDb, tbl } from "@/lib/db/db";
import { active, audit, bulkPut, nowIso, put, remove } from "@/lib/db/repo";
import type { CgmImport, CgmReading } from "@/lib/db/types";
import { PARSER_VERSION, readingDedupeKey, type ParseResult } from "@/lib/domain/cgm/parse";
import { encryptBytes, decryptBytes } from "@/lib/crypto";
import { AGP_PDF_VERSION, agpSummaryRecord, hasAgpMetrics, type AgpPdfSummary } from "@/lib/domain/cgm/agp-pdf";
import { addDays, startOfLocalDay } from "@/lib/domain/time";
import { serial } from "./lock";

export interface ImportOutcome {
  importId: string;
  created: number;
  duplicates: number;
  events: number;
  warnings: string[];
}

export async function findImportByHash(hash: string): Promise<CgmImport | undefined> {
  return (await tbl("cgm_imports").where("fileHash").equals(hash).toArray()).find(active);
}

/** Importa el resumen publicado en el PDF; no crea muestras ni eventos clínicos. */
export function saveAgpPdfImport(summary: AgpPdfSummary, file: { name: string; size: number; hash: string; bytes: ArrayBuffer; keepRaw: boolean; timezone: string }) {
  return serial("agp-pdf-import", async () => {
    const existing = await findImportByHash(file.hash);
    if (existing) return { importId: existing.id, duplicate: true };
    if (!hasAgpMetrics(summary)) throw new Error("No se reconocen métricas de glucosa en este PDF. No se ha guardado nada.");
    const encrypted = file.keepRaw ? await encryptBytes(file.bytes) : null;
    const db = getDb();
    return db.transaction("rw", [db.table("cgm_imports"), db.table("raw_files"), db.outbox], async () => {
      const imp = await put("cgm_imports", {
        fileName: file.name.slice(0, 200), fileSize: file.size, fileHash: file.hash, format: "agp_pdf", parserVersion: AGP_PDF_VERSION,
        importedAt: nowIso(), periodStart: summary.periodStartDate ? new Date(startOfLocalDay(summary.periodStartDate, file.timezone)).toISOString() : null,
        periodEnd: summary.periodEndDate ? new Date(startOfLocalDay(addDays(summary.periodEndDate, 1), file.timezone)).toISOString() : null,
        readingsCount: 0, duplicatesSkipped: 0, rowsRejected: 0, unit: summary.reportedUnit ?? "mg/dL", timezone: file.timezone,
        warnings: ["Métricas del informe PDF: no son lecturas individuales ni datos en tiempo real.", ...summary.warnings], rawStored: !!encrypted,
        reportSummary: agpSummaryRecord(summary),
      });
      if (encrypted) await put("raw_files", { importId: imp.id, fileName: file.name.slice(0, 200), mime: "application/pdf", iv: encrypted.iv, data: encrypted.data });
      return { importId: imp.id, duplicate: false };
    });
  });
}

/** Orden por periodo, no por el momento en que se volvió a subir un documento antiguo. */
export async function agpPdfReports(): Promise<CgmImport[]> {
  const reports = (await tbl("cgm_imports").toArray()).filter((r) => active(r) && r.format === "agp_pdf" && r.reportSummary);
  return reports.sort((a, b) => String(b.reportSummary?.periodEndDate ?? b.periodEnd ?? b.importedAt).localeCompare(String(a.reportSummary?.periodEndDate ?? a.periodEnd ?? a.importedAt)) || b.importedAt.localeCompare(a.importedAt));
}

export async function originalPdf(importId: string): Promise<Blob> {
  const raw = (await tbl("raw_files").where("importId").equals(importId).toArray()).find((r) => active(r) && r.mime === "application/pdf");
  if (!raw) throw new Error("Este dispositivo no conserva el PDF original.");
  return new Blob([await decryptBytes(raw.iv, raw.data)], { type: "application/pdf" });
}

export async function saveCgmImport(p: ParseResult, file: { name: string; size: number; hash: string; bytes: ArrayBuffer; keepRaw: boolean; timezone: string }): Promise<ImportOutcome> {
  const keys = p.readings.map((r) => readingDedupeKey(r.kind, r.ms));
  const existing = await tbl("cgm_readings").where("dedupeKey").anyOf(keys).toArray();
  const have = new Set(existing.filter(active).map((e) => e.dedupeKey));
  const fresh = p.readings.filter((r) => !have.has(readingDedupeKey(r.kind, r.ms)));
  const imp = await put("cgm_imports", {
    fileName: file.name.slice(0, 200), fileSize: file.size, fileHash: file.hash, format: p.format, parserVersion: PARSER_VERSION,
    importedAt: nowIso(), periodStart: p.readings[0] ? new Date(p.readings[0].ms).toISOString() : null,
    periodEnd: p.readings.at(-1) ? new Date(p.readings.at(-1)!.ms).toISOString() : null, readingsCount: fresh.length,
    duplicatesSkipped: p.readings.length - fresh.length + p.duplicatesInFile, rowsRejected: p.rejected.length, unit: p.unit,
    timezone: file.timezone, warnings: p.warnings, rawStored: file.keepRaw, reportSummary: null,
  });
  await bulkPut("cgm_readings", fresh.map((r) => ({
    importId: imp.id, ts: new Date(r.ms).toISOString(), localTime: r.localTime, valueMgdl: r.mgdl, originalValue: r.value,
    originalUnit: r.unit, kind: r.kind, dedupeKey: readingDedupeKey(r.kind, r.ms), ambiguousTime: r.ambiguous || undefined,
  })));
  // Eventos del CSV (insulina como DATO HISTÓRICO, comidas, notas)
  const evKeys = p.events.map((e) => `ev:${e.kind}:${e.ms}:${e.insulinType ?? ""}`);
  const haveEv = new Set((await tbl("glucose_events").where("dedupeKey").anyOf(evKeys).toArray()).filter(active).map((e) => e.dedupeKey));
  const evs = p.events.filter((_, i) => !haveEv.has(evKeys[i]));
  await bulkPut("glucose_events", evs.map((e) => ({
    ts: new Date(e.ms).toISOString(), kind: e.kind === "ketone" ? "note" as const : e.kind, value: e.value, unit: e.unit,
    insulinType: e.insulinType, note: e.kind === "ketone" ? `Cetonemia ${e.value} mmol/L` : e.note, source: "imported" as const,
    importId: imp.id, dedupeKey: `ev:${e.kind}:${e.ms}:${e.insulinType ?? ""}`,
  })));
  if (file.keepRaw) {
    const enc = await encryptBytes(file.bytes);
    await put("raw_files", { importId: imp.id, fileName: file.name, mime: "text/csv", iv: enc.iv, data: enc.data });
  }
  await put("import_jobs", { kind: "cgm_csv", fileName: file.name.slice(0, 200), status: p.rejected.length ? "partial" : "ok", created: fresh.length, skipped: p.readings.length - fresh.length, errors: p.rejected.slice(0, 20).map((r) => `línea ${r.line}: ${r.reason}`), importedAt: nowIso() });
  await audit("cgm_import", { readings: fresh.length, format: p.format });
  return { importId: imp.id, created: fresh.length, duplicates: p.readings.length - fresh.length, events: evs.length, warnings: p.warnings };
}

export async function deleteImport(importId: string) {
  const db = getDb();
  const readings = await tbl("cgm_readings").where("importId").equals(importId).primaryKeys();
  await remove("cgm_readings", readings as string[]);
  const evs = (await db.table("glucose_events").toArray()).filter((e) => e.importId === importId).map((e) => e.id);
  await remove("glucose_events", evs);
  const raw = await tbl("raw_files").where("importId").equals(importId).primaryKeys();
  await remove("raw_files", raw as string[]);
  await remove("cgm_imports", importId);
  await audit("cgm_import_deleted", {});
}

export async function deleteRawFile(importId: string) {
  const raw = await tbl("raw_files").where("importId").equals(importId).primaryKeys();
  await remove("raw_files", raw as string[]);
  const imp = await tbl("cgm_imports").get(importId);
  if (imp) await put("cgm_imports", { ...imp, rawStored: false });
}

export async function readingsBetween(fromMs: number, toMs: number, kinds: CgmReading["kind"][] = ["historic"]): Promise<CgmReading[]> {
  const rs = await tbl("cgm_readings").where("ts").between(new Date(fromMs).toISOString(), new Date(toMs).toISOString(), true, false).toArray();
  return rs.filter((r) => active(r) && kinds.includes(r.kind));
}

export async function lastReading(): Promise<CgmReading | undefined> {
  const r = await tbl("cgm_readings").orderBy("ts").reverse().filter((x) => active(x)).first();
  return r;
}
