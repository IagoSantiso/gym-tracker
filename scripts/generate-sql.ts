/** Regenera supabase/schema.sql. Uso: npm run db:sql */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateSql } from "../lib/db/sql";

const file = join(process.cwd(), "supabase", "schema.sql");
writeFileSync(file, generateSql());
console.log("SQL generado en", file);
