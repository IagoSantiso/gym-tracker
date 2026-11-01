/**
 * Motor de sincronización offline-first, independiente del proveedor.
 *  PUSH: outbox (orden de dependencias FK) → upsert idempotente por (user_id, id).
 *  PULL: por tabla, filas con (server_updated_at, id) > cursor; última escritura gana por updatedAt.
 * Los borrados viajan como borrado lógico (deletedAt).
 */
import { getDb, getMeta, setMeta, tbl } from "@/lib/db/db";
import { SYNC_TABLES, dependencyOrder, parseColumn, syncColumns, tableDef, toSnake, BASE_COLUMNS } from "@/lib/db/schema";
import type { TableName } from "@/lib/db/types";

export type Row = Record<string, unknown>;

export interface RemoteAdapter {
  userId(): Promise<string | null>;
  upsert(table: string, rows: Row[]): Promise<void>;
  /** filas con (server_updated_at, id) > cursor, ordenadas, máx `limit` */
  pull(table: string, cursor: { ts: string; id: string } | null, limit: number): Promise<Row[]>;
  deleteAll(table: string): Promise<void>;
}

const tsCols = (t: TableName) => {
  const cols = { ...BASE_COLUMNS, ...tableDef(t).columns };
  return Object.entries(cols).filter(([, s]) => parseColumn(s).type === "timestamptz").map(([k]) => k);
};

export function toRow(table: TableName, rec: Record<string, unknown>, userId: string): Row {
  const row: Row = { user_id: userId };
  for (const c of syncColumns(table)) {
    const v = rec[c];
    row[toSnake(c)] = v === undefined ? null : v;
  }
  return row;
}

export function fromRow(table: TableName, row: Row): Record<string, unknown> {
  const rec: Record<string, unknown> = {};
  for (const c of syncColumns(table)) {
    const v = row[toSnake(c)];
    if (v !== null && v !== undefined) rec[c] = v;
  }
  for (const c of tsCols(table)) if (typeof rec[c] === "string") rec[c] = new Date(rec[c] as string).toISOString();
  for (const [c, spec] of Object.entries(tableDef(table).columns)) {
    if (parseColumn(spec).type === "numeric" && typeof rec[c] === "string") rec[c] = Number(rec[c]);
  }
  return rec;
}

const time = (s: unknown) => (typeof s === "string" ? Date.parse(s) : 0);

export interface SyncResult {
  pushed: number;
  pulled: number;
}

export async function syncOnce(remote: RemoteAdapter, opts: { batch?: number } = {}): Promise<SyncResult> {
  const batch = opts.batch ?? 500;
  const uid = await remote.userId();
  if (!uid) throw new Error("Sin sesión");
  const db = getDb();
  const owner = await getMeta<string | null>("syncOwner", null);
  if (owner && owner !== uid) throw new Error("Este dispositivo está vinculado a otra cuenta. Exporta y borra los datos antes de cambiar de cuenta.");
  if (!owner) await setMeta("syncOwner", uid);

  /* ── PUSH ── */
  let pushed = 0;
  const entries = await db.outbox.orderBy("seq").toArray();
  const maxSeq = entries.at(-1)?.seq ?? 0;
  const byTable = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!byTable.has(e.table)) byTable.set(e.table, new Set());
    byTable.get(e.table)!.add(e.id);
  }
  for (const t of dependencyOrder()) {
    const ids = byTable.get(t);
    if (!ids || !tableDef(t).sync) continue;
    const recs = (await tbl(t).bulkGet([...ids])).filter(Boolean) as unknown as Record<string, unknown>[];
    for (let i = 0; i < recs.length; i += batch) {
      await remote.upsert(t, recs.slice(i, i + batch).map((r) => toRow(t, r, uid)));
    }
    pushed += recs.length;
    await db.outbox.where("table").equals(t).and((e) => (e.seq ?? 0) <= maxSeq).delete();
  }

  /* ── PULL ── */
  let pulled = 0;
  for (const def of SYNC_TABLES) {
    const t = def.name;
    let cursor = await getMeta<{ ts: string; id: string } | null>(`cursor:${t}`, null);
    for (;;) {
      const rows = await remote.pull(t, cursor, batch);
      if (!rows.length) break;
      const pending = new Set((await db.outbox.where("table").equals(t).toArray()).map((e) => e.id));
      const incoming = rows.map((r) => fromRow(t, r));
      const locals = await tbl(t).bulkGet(incoming.map((r) => r.id as string));
      const toWrite = incoming.filter((r, i) => {
        const local = locals[i] as unknown as Record<string, unknown> | undefined;
        if (!local) return true;
        if (time(local.updatedAt) >= time(r.updatedAt)) return false; // local igual o más reciente
        return !pending.has(r.id as string) || time(r.updatedAt) > time(local.updatedAt);
      });
      if (toWrite.length) await tbl(t).bulkPut(toWrite as never[]);
      pulled += toWrite.length;
      const last = rows.at(-1)!;
      cursor = { ts: new Date(String(last.server_updated_at)).toISOString(), id: String(last.id) };
      await setMeta(`cursor:${t}`, cursor);
      if (rows.length < batch) break;
    }
  }
  return { pushed, pulled };
}

/** Borra en remoto todos los datos del usuario (hijos primero). */
export async function deleteAllRemote(remote: RemoteAdapter) {
  for (const t of [...dependencyOrder()].reverse()) if (tableDef(t).sync) await remote.deleteAll(t);
}

export async function pendingCount(): Promise<number> {
  return getDb().outbox.count();
}
