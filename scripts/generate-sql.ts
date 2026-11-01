/** Regenera supabase/migrations/20261101000000_nexo_schema.sql. Uso: npm run db:sql */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateSql } from "../lib/db/sql";

const file = join(process.cwd(), "supabase", "migrations", "20261101000000_nexo_schema.sql");
writeFileSync(file, generateSql());
console.log("SQL generado en", file);
