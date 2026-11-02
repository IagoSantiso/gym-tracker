/** Exportación (JSON completo + CSV) y borrado de datos personales. */
import { getDb, tbl } from "@/lib/db/db";
import { TABLES } from "@/lib/db/schema";
import { audit, nowIso } from "@/lib/db/repo";
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

export interface RestoreResult {
  restored: number;
  replaced: number;
}

/**
 * Restaura un JSON exportado de NEXO.
 *  - mode "replace" (por defecto): la copia pasa a ser la verdad. Lo que había en este
 *    dispositivo y no está en la copia se marca como borrado (y el borrado se sincroniza),
 *    así no quedan dos menús o dos planes para la misma semana.
 *  - mode "merge": solo añade/actualiza por id.
 * Los registros restaurados reciben updatedAt nuevo para ganar en la sincronización.
 */
export async function importBackup(json: string, mode: "replace" | "merge" = "replace"): Promise<RestoreResult> {
  let parsed: { app?: unknown; data?: unknown };
  try {
    parsed = JSON.parse(json.trim().replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("El texto no es un JSON válido (¿se ha copiado entero?).");
  }
  if (parsed?.app !== "NEXO" || !parsed.data || typeof parsed.data !== "object") throw new Error("No es una copia de NEXO.");
  const data = parsed.data as Record<string, unknown>;
  let restored = 0;
  let replaced = 0;
  const db = getDb();
  const tables = TABLES.filter((t) => !t.serverOnly && t.name !== "raw_files" && Array.isArray(data[t.name]));
  if (!tables.length) throw new Error("La copia no contiene datos.");
  await db.transaction("rw", [...tables.map((t) => db.table(t.name)), db.outbox], async () => {
    for (const t of tables) {
      const valid = (data[t.name] as unknown[]).filter(
        (r): r is Record<string, unknown> & { id: string } => !!r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string",
      );
      const ids = new Set(valid.map((r) => r.id));
      const now = nowIso();
      const recs = valid.map((r) => ({ ...r, updatedAt: now }));
      if (mode === "replace") {
        const existing = (await db.table(t.name).toArray()) as { id: string; deletedAt?: string | null }[];
        const stale = existing.filter((r) => !ids.has(r.id));
        if (t.sync) {
          const toDelete = stale.filter((r) => !r.deletedAt).map((r) => ({ ...r, deletedAt: now, updatedAt: now }));
          await db.table(t.name).bulkPut(toDelete);
          if (toDelete.length) await db.outbox.bulkAdd(toDelete.map((r) => ({ table: t.name, id: r.id, at: now })));
          replaced += toDelete.length;
        } else {
          await db.table(t.name).bulkDelete(stale.map((r) => r.id));
        }
      }
      await db.table(t.name).bulkPut(recs);
      if (t.sync && recs.length) await db.outbox.bulkAdd(recs.map((r) => ({ table: t.name, id: r.id, at: now })));
      restored += recs.length;
    }
  });
  await audit("restore_backup", { restored, replaced, mode });
  return { restored, replaced };
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
