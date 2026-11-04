#!/usr/bin/env node
/**
 * Comprobaciones estáticas de seguridad (se ejecuta en `npm run lint` y en CI):
 *  1. Los secretos solo se LEEN (process.env.X) en código de servidor (lib/server/**, app/api/**).
 *  2. Todo lib/server/** importa "server-only".
 *  3. Ninguna variable NEXT_PUBLIC_* parece un secreto.
 *  4. Si existe una build, ningún chunk de cliente contiene nombres de secretos ni claves con forma de API key.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const SECRETS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "POLAR_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY", "SUPABASE_SERVICE_ROLE", "ANTHROPIC_AUTH_TOKEN"];
const errors = [];
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f === "node_modules" || f.startsWith(".")) continue;
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
const src = [...walk(join(root, "app")), ...walk(join(root, "components")), ...walk(join(root, "lib")), ...walk(join(root, "hooks"))].filter((f) => /\.(ts|tsx)$/.test(f));
for (const f of src) {
  const rel = relative(root, f).replaceAll("\\", "/");
  const code = readFileSync(f, "utf8");
  const serverSide = rel.startsWith("lib/server/") || rel.startsWith("app/api/");
  for (const s of SECRETS) if (new RegExp(`env\\.${s}|env\\[["']${s}`).test(code) && !serverSide) errors.push(`${rel}: lee ${s} fuera del servidor`);
  if (rel.startsWith("lib/server/") && !code.includes('import "server-only"')) errors.push(`${rel}: falta import "server-only"`);
  for (const m of code.matchAll(/NEXT_PUBLIC_[A-Z_]+/g)) if (/SECRET|PRIVATE|SERVICE_ROLE|API_KEY/.test(m[0])) errors.push(`${rel}: ${m[0]} parece un secreto público`);
}
const chunks = walk(join(root, ".next", "static")).filter((f) => f.endsWith(".js"));
for (const f of chunks) {
  const code = readFileSync(f, "utf8");
  for (const s of SECRETS) if (new RegExp(`env\\.${s}`).test(code)) errors.push(`${relative(root, f)}: el bundle de cliente lee ${s}`);
  if (/sk-ant-[A-Za-z0-9_-]{20,}|sk-(proj-)?[A-Za-z0-9]{30,}/.test(code)) errors.push(`${relative(root, f)}: posible clave de API embebida`);
}
if (errors.length) {
  console.error("✗ Comprobaciones de seguridad:\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
console.log(`✓ Seguridad: ${src.length} fuentes y ${chunks.length} chunks de cliente revisados`);
