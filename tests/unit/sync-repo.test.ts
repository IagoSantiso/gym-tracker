import { beforeEach, describe, expect, it } from "vitest";
import { NexoDB, getDb, setDbForTests, tbl } from "@/lib/db/db";
import { all, patch, put, remove } from "@/lib/db/repo";
import { deleteAllRemote, syncOnce, type RemoteAdapter, type Row } from "@/lib/sync/engine";
import { importLegacy, ensureInitialized } from "@/lib/db/init";

let n = 0;
beforeEach(async () => {
  const db = new NexoDB(`test-${++n}`);
  setDbForTests(db);
  await db.open();
});

/** Remoto en memoria que imita PostgREST + trigger server_updated_at + RLS por usuario. */
function memoryRemote(uid = "user-a") {
  const tables = new Map<string, Map<string, Row>>();
  let clock = Date.parse("2026-11-01T00:00:00Z");
  const remote: RemoteAdapter & { tables: typeof tables; userId(): Promise<string | null> } = {
    tables,
    async userId() { return uid; },
    async upsert(table, rows) {
      const t = tables.get(table) ?? new Map();
      for (const r of rows) {
        if (r.user_id !== uid) throw new Error("RLS");
        t.set(String(r.id), { ...r, server_updated_at: new Date(++clock).toISOString() });
      }
      tables.set(table, t);
    },
    async pull(table, cursor, limit) {
      const rows = [...(tables.get(table)?.values() ?? [])]
        .filter((r) => !cursor || String(r.server_updated_at) > cursor.ts || (r.server_updated_at === cursor.ts && String(r.id) > cursor.id))
        .sort((a, b) => String(a.server_updated_at).localeCompare(String(b.server_updated_at)) || String(a.id).localeCompare(String(b.id)));
      return rows.slice(0, limit);
    },
    async deleteAll(table) { tables.delete(table); },
  };
  return remote;
}

describe("repositorio", () => {
  it("añade timestamps, encola en outbox y hace borrado lógico", async () => {
    const w = await put("weight_entries", { date: "2026-11-01", measuredAt: "2026-11-01T07:00:00.000Z", weightKg: 82.4, source: "manual" });
    expect(w.id).toBeTruthy();
    expect(await getDb().outbox.count()).toBe(1);
    await patch("weight_entries", w.id, { weightKg: 82.1 });
    await remove("weight_entries", w.id);
    expect(await all("weight_entries")).toHaveLength(0);
    expect((await tbl("weight_entries").get(w.id))?.deletedAt).toBeTruthy();
  });
  it("importa datos del Gym Tracker v2 sin duplicar", async () => {
    await ensureInitialized();
    const legacy = {
      gymLogs: [{ date: "lun 3 nov", ts: Date.parse("2026-10-27T18:00:00Z"), title: "Empuje (3 días)", count: 6, vol: 15 }],
      gymLoads: { "3-0-bench": { weight: "42,5", reps: "12/11/10" }, "3-0-incline": { weight: "14", reps: "" } },
      gymUI: { mode: 2, day: 0, adapt: true },
    };
    const r = await importLegacy(legacy);
    expect(r.sessions).toBe(2);
    expect(r.sets).toBe(4);
    const sets = await all("exercise_sets");
    expect(sets.filter((s) => s.exerciseId === "bench").map((s) => s.reps)).toEqual([12, 11, 10]);
    expect(sets.find((s) => s.exerciseId === "bench")!.weightKg).toBe(42.5);
    const prefs = await tbl("preferences").get("me");
    expect(prefs?.strengthDaysPerWeek).toBe(2);
    expect(prefs?.adaptationMode).toBe(true);
    const again = await importLegacy(legacy);
    expect(again.sessions).toBe(0);
  });
});

describe("motor de sincronización", () => {
  it("sube cambios en orden de dependencias y vacía el outbox", async () => {
    const remote = memoryRemote();
    const s = await put("workout_sessions", { date: "2026-11-01", startedAt: "2026-11-01T10:00:00.000Z", title: "Empuje", status: "completed", deload: false, adaptation: false, source: "manual" });
    await put("exercise_sets", { sessionId: s.id, exerciseId: "bench", exerciseOrder: 0, setIndex: 0, weightKg: 40, reps: 10, completed: true, isWarmup: false });
    const r = await syncOnce(remote);
    expect(r.pushed).toBe(2);
    expect(await getDb().outbox.count()).toBe(0);
    const row = [...remote.tables.get("exercise_sets")!.values()][0];
    expect(row).toMatchObject({ user_id: "user-a", session_id: s.id, weight_kg: 40, is_warmup: false });
    expect(remote.tables.get("activity_streams")).toBeUndefined(); // tablas locales no se suben
  });
  it("descarga cambios de otro dispositivo y aplica última-escritura-gana", async () => {
    const remote = memoryRemote();
    const w = await put("weight_entries", { date: "2026-11-01", measuredAt: "2026-11-01T07:00:00.000Z", weightKg: 80, source: "manual" });
    await syncOnce(remote);
    // otro dispositivo edita más tarde
    const row = remote.tables.get("weight_entries")!.get(w.id)!;
    await remote.upsert("weight_entries", [{ ...row, weight_kg: 79.5, updated_at: "2030-01-01T00:00:00.000Z" }]);
    // y crea un registro nuevo
    await remote.upsert("weight_entries", [{ ...row, id: "remote-1", weight_kg: 79, updated_at: "2030-01-02T00:00:00.000Z" }]);
    const r = await syncOnce(remote);
    expect(r.pulled).toBe(2);
    expect((await tbl("weight_entries").get(w.id))!.weightKg).toBe(79.5);
    expect(await tbl("weight_entries").get("remote-1")).toBeTruthy();
    // un cambio remoto más antiguo no pisa uno local más nuevo
    await patch("weight_entries", w.id, { weightKg: 78 });
    await remote.upsert("weight_entries", [{ ...row, weight_kg: 90, updated_at: "2020-01-01T00:00:00.000Z" }]);
    await syncOnce(remote);
    expect((await tbl("weight_entries").get(w.id))!.weightKg).toBe(78);
  });
  it("propaga borrados como borrado lógico y permite borrar todo en remoto", async () => {
    const remote = memoryRemote();
    const w = await put("weight_entries", { date: "2026-11-01", measuredAt: "2026-11-01T07:00:00.000Z", weightKg: 80, source: "manual" });
    await syncOnce(remote);
    await remove("weight_entries", w.id);
    await syncOnce(remote);
    expect(remote.tables.get("weight_entries")!.get(w.id)!.deleted_at).toBeTruthy();
    await deleteAllRemote(remote);
    expect(remote.tables.size).toBe(0);
  });
  it("se niega a mezclar datos de otra cuenta en el mismo dispositivo", async () => {
    await syncOnce(memoryRemote("user-a"));
    await expect(syncOnce(memoryRemote("user-b"))).rejects.toThrow(/otra cuenta/);
  });
});
