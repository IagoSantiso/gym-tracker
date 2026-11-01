/** Importación y consulta de datos CGM (local). */
import { getDb, tbl } from "@/lib/db/db";
import { active, audit, bulkPut, nowIso, put, remove } from "@/lib/db/repo";
import type { CgmImport, CgmReading } from "@/lib/db/types";
import { PARSER_VERSION, readingDedupeKey, type ParseResult } from "@/lib/domain/cgm/parse";
import { encryptBytes } from "@/lib/crypto";

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
