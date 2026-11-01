/** IndexedDB (Dexie) generado a partir de schema.ts. */
import Dexie, { type Table } from "dexie";
import { SCHEMA_VERSION, TABLES } from "./schema";
import type { MetaEntry, OutboxEntry, Rec, TableName } from "./types";

export class NexoDB extends Dexie {
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaEntry, string>;

  constructor(name = "nexo") {
    super(name);
    const stores: Record<string, string> = {};
    for (const t of TABLES) {
      if (t.serverOnly) continue;
      stores[t.name] = ["id", "updatedAt", ...(t.indexes ?? [])].join(", ");
    }
    stores.outbox = "++seq, [table+id], table";
    stores.meta = "key";
    this.version(SCHEMA_VERSION).stores(stores);
  }
}

let instance: NexoDB | null = null;

export function getDb(): NexoDB {
  if (!instance) instance = new NexoDB();
  return instance;
}

/** Solo para tests: base de datos aislada. */
export function setDbForTests(db: NexoDB | null) {
  instance = db;
}

export function tbl<T extends TableName>(name: T): Table<Rec<T>, string> {
  return getDb().table(name) as Table<Rec<T>, string>;
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const e = await getDb().meta.get(key);
  return (e?.value as T) ?? fallback;
}

export async function setMeta(key: string, value: unknown) {
  await getDb().meta.put({ key, value });
}
