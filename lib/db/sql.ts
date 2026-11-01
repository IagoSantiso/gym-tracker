/**
 * Genera la migración SQL de Supabase a partir de lib/db/schema.ts.
 * PK (user_id, id), FKs compuestas, RLS por usuario y cursor server_updated_at.
 */
import { BASE_COLUMNS, SERVER_ONLY_SQL, TABLES, parseColumn, toSnake, type ColType } from "./schema";

const PG: Record<ColType, string> = {
  text: "text",
  int: "integer",
  numeric: "numeric",
  bool: "boolean",
  date: "date",
  timestamptz: "timestamptz",
  jsonb: "jsonb",
};

export function generateSql(): string {
  const out: string[] = [];
  out.push(`-- NEXO · esquema generado desde lib/db/schema.ts (no editar a mano: npm run db:sql)
-- Requiere Supabase (schema auth). Todas las tablas: PK (user_id, id), RLS user_id = auth.uid().

create or replace function public.nexo_touch() returns trigger
language plpgsql as $$
begin
  new.server_updated_at := now();
  return new;
end $$;
`);
  const fks: string[] = [];
  for (const t of TABLES) {
    if (!t.sync) continue;
    const cols = { ...BASE_COLUMNS, ...t.columns };
    const lines = [
      `  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`,
      `  id text not null`,
    ];
    for (const [name, spec] of Object.entries(cols)) {
      const c = parseColumn(spec);
      lines.push(`  ${toSnake(name)} ${PG[c.type]}${c.notNull ? " not null" : ""}`);
      if (c.ref) {
        fks.push(
          `alter table public.${t.name} add constraint ${t.name}_${toSnake(name)}_fk foreign key (user_id, ${toSnake(name)}) references public.${c.ref}(user_id, id) on delete cascade deferrable initially deferred;`,
        );
      }
    }
    lines.push(`  server_updated_at timestamptz not null default now()`);
    lines.push(`  primary key (user_id, id)`);
    out.push(`-- ${t.comment}\ncreate table if not exists public.${t.name} (\n${lines.join(",\n")}\n);`);
    out.push(`create index if not exists ${t.name}_sync_idx on public.${t.name} (user_id, server_updated_at);`);
    for (const u of t.uniques ?? []) {
      out.push(
        `create unique index if not exists ${t.name}_${u.map(toSnake).join("_")}_uq on public.${t.name} (user_id, ${u.map(toSnake).join(", ")});`,
      );
    }
    out.push(
      `create trigger ${t.name}_touch before insert or update on public.${t.name} for each row execute function public.nexo_touch();`,
    );
    out.push(`alter table public.${t.name} enable row level security;`);
    out.push(
      `create policy ${t.name}_select on public.${t.name} for select to authenticated using (user_id = (select auth.uid()));`,
      `create policy ${t.name}_insert on public.${t.name} for insert to authenticated with check (user_id = (select auth.uid()));`,
      `create policy ${t.name}_update on public.${t.name} for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));`,
      `create policy ${t.name}_delete on public.${t.name} for delete to authenticated using (user_id = (select auth.uid()));`,
      "",
    );
  }
  out.push("-- Claves foráneas compuestas (impiden relacionar datos de usuarios distintos)");
  out.push(...fks, "");
  out.push(SERVER_ONLY_SQL.trim(), "");
  return out.join("\n");
}
