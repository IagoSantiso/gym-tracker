/**
 * Repositorio: ÚNICO punto de escritura. Añade id/timestamps, aplica borrado lógico
 * en tablas sincronizadas y encola cada cambio en el outbox.
 */
import { getDb, tbl } from "./db";
import { tableDef } from "./schema";
import type { Rec, TableName } from "./types";

type Listener = () => void;
const listeners = new Set<Listener>();
export const onLocalChange = (fn: Listener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = () => listeners.forEach((fn) => fn());

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

let lastTs = 0;
/** Marca temporal ISO estrictamente creciente en este dispositivo. */
export function nowIso(): string {
  const t = Math.max(Date.now(), lastTs + 1);
  lastTs = t;
  return new Date(t).toISOString();
}

export type Input<T extends TableName> = Omit<Rec<T>, "id" | "createdAt" | "updatedAt"> &
  Partial<Pick<Rec<T>, "id" | "createdAt" | "updatedAt">>;

const isSync = (t: TableName) => tableDef(t).sync;

async function enqueue(table: TableName, ids: string[]) {
  if (!isSync(table) || !ids.length) return;
  const at = nowIso();
  await getDb().outbox.bulkAdd(ids.map((id) => ({ table, id, at })));
}

/** Inserta o reemplaza un registro completo. */
export async function put<T extends TableName>(table: T, input: Input<T>): Promise<Rec<T>> {
  const db = getDb();
  let saved!: Rec<T>;
  await db.transaction("rw", [db.table(table), db.outbox], async () => {
    const id = input.id ?? newId();
    const prev = (await tbl(table).get(id)) as Rec<T> | undefined;
    const now = nowIso();
    saved = { ...input, id, createdAt: prev?.createdAt ?? input.createdAt ?? now, updatedAt: now } as Rec<T>;
    await tbl(table).put(saved);
    await enqueue(table, [id]);
  });
  emit();
  return saved;
}

/** Actualiza campos de un registro existente. */
export async function patch<T extends TableName>(table: T, id: string, changes: Partial<Rec<T>>): Promise<Rec<T> | undefined> {
  const db = getDb();
  let saved: Rec<T> | undefined;
  await db.transaction("rw", [db.table(table), db.outbox], async () => {
    const prev = (await tbl(table).get(id)) as Rec<T> | undefined;
    if (!prev) return;
    saved = { ...prev, ...changes, id, updatedAt: nowIso() } as Rec<T>;
    await tbl(table).put(saved);
    await enqueue(table, [id]);
  });
  emit();
  return saved;
}

/** Borrado: lógico en tablas sincronizadas (para propagarlo), físico en locales. */
export async function remove<T extends TableName>(table: T, id: string | string[]): Promise<void> {
  const ids = Array.isArray(id) ? id : [id];
  const db = getDb();
  await db.transaction("rw", [db.table(table), db.outbox], async () => {
    if (!isSync(table)) {
      await tbl(table).bulkDelete(ids);
      return;
    }
    const now = nowIso();
    const rows = (await tbl(table).bulkGet(ids)).filter(Boolean) as Rec<T>[];
    await tbl(table).bulkPut(rows.map((r) => ({ ...r, deletedAt: now, updatedAt: now })));
    await enqueue(table, rows.map((r) => r.id));
  });
  emit();
}

/** Inserción masiva (importaciones). Devuelve los registros guardados. */
export async function bulkPut<T extends TableName>(table: T, inputs: Input<T>[]): Promise<Rec<T>[]> {
  if (!inputs.length) return [];
  const db = getDb();
  const now = nowIso();
  const recs = inputs.map((i) => ({ ...i, id: i.id ?? newId(), createdAt: i.createdAt ?? now, updatedAt: now }) as Rec<T>);
  await db.transaction("rw", [db.table(table), db.outbox], async () => {
    await tbl(table).bulkPut(recs);
    await enqueue(table, recs.map((r) => r.id));
  });
  emit();
  return recs;
}

export const active = <T extends { deletedAt?: string | null }>(r: T | undefined | null): r is T => !!r && !r.deletedAt;

/** Todos los registros no borrados de una tabla. */
export async function all<T extends TableName>(table: T): Promise<Rec<T>[]> {
  return (await tbl(table).toArray()).filter(active) as Rec<T>[];
}

export async function getOne<T extends TableName>(table: T, id: string): Promise<Rec<T> | undefined> {
  const r = (await tbl(table).get(id)) as Rec<T> | undefined;
  return active(r) ? r : undefined;
}

/** Consulta por índice con filtro de borrados. */
export async function where<T extends TableName>(table: T, index: string, value: unknown): Promise<Rec<T>[]> {
  return ((await tbl(table).where(index).equals(value as string).toArray()) as Rec<T>[]).filter(active);
}

export async function between<T extends TableName>(table: T, index: string, lo: string, hi: string): Promise<Rec<T>[]> {
  return ((await tbl(table).where(index).between(lo, hi, true, true).toArray()) as Rec<T>[]).filter(active);
}

/** Registro de auditoría sin contenido sensible. */
export async function audit(action: string, detail: Record<string, string | number | boolean | null> = {}) {
  await put("audit_events", { ts: nowIso(), action, detail });
}
