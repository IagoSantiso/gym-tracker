/**
 * Motor de sincronización offline-first, independiente del proveedor.
 *  PULL (primero): por tabla, filas con (server_updated_at, id) > cursor; gana el updatedAt más reciente.
 *  PUSH: outbox (orden de dependencias FK) → upsert idempotente por (user_id, id); el servidor
 *        ignora actualizaciones con updated_at más antiguo (trigger nexo_touch).
 * Los borrados viajan como borrado lógico (deletedAt).
 */
import { getDb, getMeta, setMeta, tbl } from "@/lib/db/db";
import { SYNC_TABLES, dependencyOrder, parseColumn, syncColumns, tableDef, toSnake, BASE_COLUMNS } from "@/lib/db/schema";
import type { TableName } from "@/lib/db/types";
import { holdGenerations } from "@/lib/services/lock";

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
  /** primera sincronización de este dispositivo: "adopted" = se adoptaron los datos de la nube */
  first?: "adopted" | "uploaded";
}

/** Tablas sincronizadas que se vacían al adoptar los datos de la nube. */
const syncNames = () => SYNC_TABLES.map((d) => d.name);

/**
 * Primera sincronización del dispositivo:
 *  - si la nube ya tiene datos de la cuenta (otro dispositivo), este dispositivo ADOPTA la nube:
 *    se guarda una instantánea local (meta preSyncBackup) y se vacían las tablas sincronizadas,
 *    para que los valores por defecto o un menú generado aquí no pisen ni dupliquen los reales;
 *  - si la nube está vacía, se sube TODO lo local (no solo el outbox).
 */
async function firstSync(remote: RemoteAdapter): Promise<"adopted" | "uploaded"> {
  const db = getDb();
  const remoteHasData = (await remote.pull("profiles", null, 1)).length > 0;
  if (remoteHasData) {
    const snapshot: Record<string, unknown[]> = {};
    for (const t of syncNames()) {
      const rows = await tbl(t).toArray();
      if (rows.length) snapshot[t] = rows;
    }
    await setMeta("preSyncBackup", { app: "NEXO", schema: 1, exportedAt: new Date().toISOString(), data: snapshot });
    await db.transaction("rw", [...syncNames().map((t) => db.table(t)), db.outbox], async () => {
      for (const t of syncNames()) await tbl(t).clear();
      await db.outbox.clear();
    });
    for (const t of syncNames()) await setMeta(`cursor:${t}`, null);
    return "adopted";
  }
  const at = new Date().toISOString();
  for (const t of syncNames()) {
    const ids = (await tbl(t).toCollection().primaryKeys()) as string[];
    if (ids.length) await db.outbox.bulkAdd(ids.map((id) => ({ table: t, id, at })));
  }
  return "uploaded";
}

/**
 * Un ciclo: PULL primero (para no pisar a ciegas cambios de otro dispositivo) y luego PUSH.
 * Conflictos: gana el updatedAt más reciente; si gana el remoto se descarta el cambio pendiente
 * local. El servidor aplica la misma regla (trigger nexo_touch), así un push tardío no pisa nada.
 */
export async function syncOnce(remote: RemoteAdapter, opts: { batch?: number } = {}): Promise<SyncResult> {
  const batch = opts.batch ?? 500;
  const uid = await remote.userId();
  if (!uid) throw new Error("Sin sesión");
  const db = getDb();
  const owner = await getMeta<string | null>("syncOwner", null);
  if (owner && owner !== uid) throw new Error("Este dispositivo está vinculado a otra cuenta. Exporta y borra los datos antes de cambiar de cuenta.");
  let first: SyncResult["first"];
  const release = owner ? null : holdGenerations();
  try {
    if (!owner) {
      first = await firstSync(remote);
      await setMeta("syncOwner", uid);
    }
    return await cycle(remote, uid, batch, first);
  } finally {
    release?.();
  }
}

async function cycle(remote: RemoteAdapter, uid: string, batch: number, first: SyncResult["first"]): Promise<SyncResult> {
  const db = getDb();

  /* ── PULL ── */
  let pulled = 0;
  for (const def of SYNC_TABLES) {
    const t = def.name;
    let cursor = await getMeta<{ ts: string; id: string } | null>(`cursor:${t}`, null);
    for (;;) {
      const rows = await remote.pull(t, cursor, batch);
      if (!rows.length) break;
      const incoming = rows.map((r) => fromRow(t, r));
      await db.transaction("rw", [db.table(t), db.outbox], async () => {
        const locals = await tbl(t).bulkGet(incoming.map((r) => r.id as string));
        const toWrite = incoming.filter((r, i) => {
          const local = locals[i] as unknown as Record<string, unknown> | undefined;
          return !local || time(r.updatedAt) > time(local.updatedAt);
        });
        if (!toWrite.length) return;
        await tbl(t).bulkPut(toWrite as never[]);
        const won = new Set(toWrite.map((r) => r.id as string));
        await db.outbox.where("table").equals(t).and((e) => won.has(e.id)).delete();
        pulled += toWrite.length;
      });
      const last = rows.at(-1)!;
      cursor = { ts: new Date(String(last.server_updated_at)).toISOString(), id: String(last.id) };
      await setMeta(`cursor:${t}`, cursor);
      if (rows.length < batch) break;
    }
  }

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
  return { pushed, pulled, first };
}

/** Borra en remoto todos los datos del usuario (hijos primero). */
export async function deleteAllRemote(remote: RemoteAdapter) {
  for (const t of [...dependencyOrder()].reverse()) if (tableDef(t).sync) await remote.deleteAll(t);
}

export async function pendingCount(): Promise<number> {
  return getDb().outbox.count();
}
