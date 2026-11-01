/** Exportación (JSON completo + CSV) y borrado de datos personales. */
import { getDb, tbl } from "@/lib/db/db";
import { TABLES } from "@/lib/db/schema";
import { audit } from "@/lib/db/repo";
import type { TableName } from "@/lib/db/types";
import { deleteAllRemote } from "@/lib/sync/engine";
import { getSupabase, supabaseAdapter } from "@/lib/sync/supabase";

export async function exportAll(): Promise<Blob> {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    if (t.serverOnly || t.name === "raw_files") continue;
    out[t.name] = await tbl(t.name).toArray();
  }
  await audit("export_json", { tables: Object.keys(out).length });
  return new Blob([JSON.stringify({ app: "NEXO", schema: 1, exportedAt: new Date().toISOString(), data: out }, null, 1)], { type: "application/json" });
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))].join("\n");
}

export async function exportCsv(table: TableName): Promise<Blob> {
  const rows = (await tbl(table).toArray()).filter((r) => !(r as { deletedAt?: string }).deletedAt) as unknown as Record<string, unknown>[];
  await audit("export_csv", { table });
  return new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
}

export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Restaura un JSON exportado (fusiona por id; no borra lo existente). */
export async function importBackup(json: string): Promise<number> {
  const parsed = JSON.parse(json);
  if (parsed?.app !== "NEXO" || typeof parsed.data !== "object") throw new Error("No es una copia de NEXO.");
  let n = 0;
  const db = getDb();
  for (const t of TABLES) {
    const rows = parsed.data[t.name];
    if (!Array.isArray(rows) || t.serverOnly || t.name === "raw_files") continue;
    const valid = rows.filter((r: unknown) => r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string");
    await db.table(t.name).bulkPut(valid);
    if (t.sync) await db.outbox.bulkAdd(valid.map((r: { id: string }) => ({ table: t.name, id: r.id, at: new Date().toISOString() })));
    n += valid.length;
  }
  return n;
}

/** Borra TODOS los datos: remoto (si hay sesión) y local. Irreversible. */
export async function deleteEverything(opts: { remote: boolean }): Promise<{ remoteDeleted: boolean }> {
  let remoteDeleted = false;
  const sb = getSupabase();
  if (opts.remote && sb) {
    const { data } = await sb.auth.getSession();
    if (data.session) {
      await deleteAllRemote(supabaseAdapter(sb));
      remoteDeleted = true;
      await sb.auth.signOut();
    }
  }
  const db = getDb();
  await db.delete();
  for (const k of ["gymLogs", "gymLoads", "gymSets", "gymUI", "gymTimer", "nexo-theme"]) {
    try { localStorage.removeItem(k); } catch { /* */ }
  }
  return { remoteDeleted };
}
