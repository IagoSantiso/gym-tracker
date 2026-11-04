import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { generateSql } from "@/lib/db/sql";
import { SYNC_TABLES, dependencyOrder, syncColumns, toSnake } from "@/lib/db/schema";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

async function bootstrap(sql = generateSql()) {
  const pg = new PGlite();
  // Stub mínimo del esquema auth de Supabase
  await pg.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  await pg.exec(sql);
  await pg.exec(`grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;`);
  return pg;
}

describe("migración SQL generada", () => {
  it("las migraciones incrementales producen las columnas del esquema actual", async () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const migrated = await bootstrap(readdirSync(dir).filter(f => f.endsWith(".sql")).sort().map(f => readFileSync(join(dir, f), "utf8")).join("\n"));
    const generated = await bootstrap();
    const q = "select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema='public' order by table_name, column_name";
    expect((await migrated.query(q)).rows).toEqual((await generated.query(q)).rows);
    await migrated.close(); await generated.close();
  });

  it("se aplica en Postgres y aísla datos por usuario con RLS", async () => {
    const pg = await bootstrap();
    const asUser = async (uid: string, sql: string) => {
      await pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
      try {
        return await pg.query(sql);
      } finally {
        await pg.exec(`reset role;`);
      }
    };
    const now = new Date().toISOString();
    await asUser(A, `insert into public.weight_entries (user_id, id, created_at, updated_at, date, measured_at, weight_kg, source)
      values ('${A}', 'w1', '${now}', '${now}', '2026-10-01', '${now}', 80.5, 'manual')`);
    const own = await asUser(A, `select * from public.weight_entries`);
    expect(own.rows).toHaveLength(1);
    const other = await asUser(B, `select * from public.weight_entries`);
    expect(other.rows).toHaveLength(0);
    // B no puede insertar filas a nombre de A
    await expect(
      asUser(B, `insert into public.weight_entries (user_id, id, created_at, updated_at, date, measured_at, weight_kg, source)
        values ('${A}', 'w2', '${now}', '${now}', '2026-10-01', '${now}', 70, 'manual')`),
    ).rejects.toThrow();
    // B no puede colgar una serie de la sesión de A (FK compuesta)
    await asUser(A, `insert into public.workout_sessions (user_id, id, created_at, updated_at, date, started_at, title, status, deload, adaptation, source)
      values ('${A}', 's1', '${now}', '${now}', '2026-10-01', '${now}', 'X', 'completed', false, false, 'manual')`);
    await expect(
      pg.transaction(async (tx) => {
        await tx.exec(`insert into public.exercise_sets (user_id, id, created_at, updated_at, session_id, exercise_id, exercise_order, set_index, completed, is_warmup)
          values ('${B}', 'x1', '${now}', '${now}', 's1', 'bench', 0, 0, true, false)`);
      }),
    ).rejects.toThrow();
    // server_updated_at lo pone el trigger
    const r = await pg.query<{ server_updated_at: Date }>(`select server_updated_at from public.weight_entries`);
    expect(r.rows[0].server_updated_at).toBeTruthy();
    await pg.close();
  });

  it("cada columna sincronizable existe en su tabla", async () => {
    const pg = await bootstrap();
    for (const t of SYNC_TABLES) {
      const res = await pg.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema='public' and table_name=$1`,
        [t.name],
      );
      const cols = new Set(res.rows.map((r) => r.column_name));
      for (const c of syncColumns(t.name)) expect(cols.has(toSnake(c)), `${t.name}.${c}`).toBe(true);
    }
    await pg.close();
  });

  it("orden de dependencias pone padres antes que hijos", () => {
    const o = dependencyOrder();
    expect(o.indexOf("workout_sessions")).toBeLessThan(o.indexOf("exercise_sets"));
    expect(o.indexOf("cgm_imports")).toBeLessThan(o.indexOf("cgm_readings"));
    expect(o.indexOf("experiments")).toBeLessThan(o.indexOf("habit_entries"));
  });
});
