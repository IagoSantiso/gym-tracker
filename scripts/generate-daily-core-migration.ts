/** Additive migration generated exclusively from the canonical column definitions. */
import { readdirSync, writeFileSync } from "node:fs";
import { TABLES, parseColumn, toSnake } from "../lib/db/schema";
const additions: Record<string, string[]> = {
  preferences: ["favoriteExerciseIds"],
  exercise_sets: ["durationSec"],
  daily_activity: ["nutritionSignature"],
  food_logs: ["favorite"],
};
const pg: Record<string, string> = {
  int: "integer",
  bool: "boolean",
  text: "text",
  jsonb: "jsonb",
};
const statements = Object.entries(additions).flatMap(([name, cols]) =>
  cols.map((col) => {
    const t = TABLES.find((t) => t.name === name)!;
    const spec = parseColumn(t.columns[col]);
    if (spec.notNull || !pg[spec.type])
      throw new Error("Only nullable additive columns are supported");
    return `alter table public.${name} add column if not exists ${toSnake(col)} ${pg[spec.type]};`;
  }),
);
const file = readdirSync("supabase/migrations").find((f) =>
  f.endsWith("_wellbeing_daily_core.sql"),
);
if (!file) throw new Error("Create migration with Supabase CLI first");
writeFileSync(
  `supabase/migrations/${file}`,
  `-- Generated from lib/db/schema.ts by scripts/generate-daily-core-migration.ts\n${statements.join("\n")}\n`,
);
