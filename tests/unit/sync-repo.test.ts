import { beforeEach, describe, expect, it } from "vitest";
import { NexoDB, getDb, setDbForTests, tbl } from "@/lib/db/db";
import { all, patch, put, remove } from "@/lib/db/repo";
import { deleteAllRemote, syncOnce, type RemoteAdapter, type Row } from "@/lib/sync/engine";
import { importLegacy, ensureInitialized, resetInitForTests } from "@/lib/db/init";

let n = 0;
beforeEach(async () => {
  const db = new NexoDB(`test-${++n}`);
  setDbForTests(db);
  resetInitForTests();
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
        const old = t.get(String(r.id));
        if (old && String(r.updated_at) < String(old.updated_at)) continue; // trigger nexo_touch (LWW)
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
    // otro dispositivo edita después y crea un registro nuevo
    const row = remote.tables.get("weight_entries")!.get(w.id)!;
    const later = new Date(Date.parse(String(row.updated_at)) + 60_000).toISOString();
    await remote.upsert("weight_entries", [{ ...row, weight_kg: 79.5, updated_at: later }]);
    await remote.upsert("weight_entries", [{ ...row, id: "remote-1", weight_kg: 79, updated_at: later }]);
    const r = await syncOnce(remote);
    expect(r.pulled).toBe(2);
    expect((await tbl("weight_entries").get(w.id))!.weightKg).toBe(79.5);
    expect(await tbl("weight_entries").get("remote-1")).toBeTruthy();
    // una edición local posterior sigue ganando aunque el reloj local vaya atrasado
    await patch("weight_entries", w.id, { weightKg: 78 });
    expect(Date.parse((await tbl("weight_entries").get(w.id))!.updatedAt) > Date.parse(later)).toBe(true);
    await syncOnce(remote);
    expect(remote.tables.get("weight_entries")!.get(w.id)!.weight_kg).toBe(78);
  });
  it("un cambio pendiente más antiguo no pisa en la nube uno más nuevo de otro dispositivo", async () => {
    const remote = memoryRemote();
    const w = await put("weight_entries", { date: "2026-11-01", measuredAt: "2026-11-01T07:00:00.000Z", weightKg: 80, source: "manual" });
    await syncOnce(remote);
    await patch("weight_entries", w.id, { weightKg: 81 }); // pendiente local
    const row = remote.tables.get("weight_entries")!.get(w.id)!;
    const future = new Date(Date.now() + 3_600_000).toISOString(); // el otro dispositivo editó después
    await remote.upsert("weight_entries", [{ ...row, weight_kg: 77, updated_at: future }]);
    await syncOnce(remote);
    expect((await tbl("weight_entries").get(w.id))!.weightKg).toBe(77);
    expect(remote.tables.get("weight_entries")!.get(w.id)!.weight_kg).toBe(77);
    expect(await getDb().outbox.count()).toBe(0);
  });
  it("un dispositivo nuevo adopta los datos de la nube sin pisarlos ni duplicar", async () => {
    const remote = memoryRemote();
    // Dispositivo A (móvil): perfil configurado y menú
    await ensureInitialized();
    await patch("profiles", "me", { displayName: "Móvil", onboardingCompletedAt: "2026-11-01T08:00:00.000Z", draft: false });
    await put("meal_plans", { id: "plan-movil", weekStart: "2026-10-27", generatedAt: "2026-10-27T08:00:00.000Z", settings: {}, generatorVersion: "t" });
    const a = await syncOnce(remote);
    expect(a.first).toBe("uploaded");
    expect(remote.tables.get("profiles")!.get("me")!.display_name).toBe("Móvil");
    // Dispositivo B (PC): base nueva con valores por defecto y un menú propio generado
    setDbForTests(new NexoDB(`test-${++n}`));
    resetInitForTests();
    await ensureInitialized();
    await put("meal_plans", { id: "plan-pc", weekStart: "2026-10-27", generatedAt: "2026-10-27T08:00:00.000Z", settings: {}, generatorVersion: "t" });
    const b = await syncOnce(remote);
    expect(b.first).toBe("adopted");
    expect((await tbl("profiles").get("me"))!.displayName).toBe("Móvil");
    expect((await all("meal_plans")).map((p) => p.id)).toEqual(["plan-movil"]);
    expect(remote.tables.get("meal_plans")!.has("plan-pc")).toBe(false);
    expect(remote.tables.get("profiles")!.get("me")!.display_name).toBe("Móvil");
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

describe("restaurar copia", () => {
  it("sustituye los datos del dispositivo y propaga como borrado lo que no estaba en la copia", async () => {
    const { importBackup, exportAll } = await import("@/lib/services/data");
    await ensureInitialized();
    await patch("profiles", "me", { displayName: "Móvil" });
    await put("meal_plans", { id: "plan-movil", weekStart: "2026-10-27", generatedAt: "2026-10-27T08:00:00.000Z", settings: {}, generatorVersion: "t" });
    const text = await (await exportAll()).text();
    // otro dispositivo
    setDbForTests(new NexoDB(`test-${++n}`));
    resetInitForTests();
    await ensureInitialized();
    await put("meal_plans", { id: "plan-pc", weekStart: "2026-10-27", generatedAt: "2026-10-27T08:00:00.000Z", settings: {}, generatorVersion: "t" });
    await expect(importBackup('{"gymLogs":[]}')).rejects.toThrow(/NEXO/);
    await expect(importBackup("{roto")).rejects.toThrow(/JSON/);
    const r = await importBackup("\n" + text + "\n");
    expect(r.restored).toBeGreaterThan(0);
    expect((await tbl("profiles").get("me"))!.displayName).toBe("Móvil");
    expect((await all("meal_plans")).map((p) => p.id)).toEqual(["plan-movil"]);
    expect((await tbl("meal_plans").get("plan-pc"))!.deletedAt).toBeTruthy();
    const pending = await getDb().outbox.where("table").equals("meal_plans").toArray();
    expect([...new Set(pending.map((e) => e.id))].sort()).toEqual(["plan-movil", "plan-pc"]);
  });
});

describe("generación concurrente", () => {
  it("dos ensurePlan simultáneos no duplican sesiones", async () => {
    const { ensurePlan, weekItems } = await import("@/lib/services/plan");
    const { localDate, weekStartOf } = await import("@/lib/domain/time");
    await ensureInitialized();
    await Promise.all([ensurePlan(localDate()), ensurePlan(localDate()), ensurePlan(localDate())]);
    const items = await weekItems(weekStartOf(localDate()));
    const keys = items.map((i) => `${i.date}|${i.title}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(items.filter((i) => i.kind === "strength")).toHaveLength(3);
  });
});
