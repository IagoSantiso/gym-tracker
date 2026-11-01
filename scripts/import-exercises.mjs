#!/usr/bin/env node
/**
 * Descarga las fotos (inicio/final) de los ejercicios mapeados en data/free-exercise-db-map.json
 * desde free-exercise-db (dominio público) y las guarda en public/exercises/<id>-0.jpg / -1.jpg,
 * redimensionadas a 560 px de ancho como las originales. Idempotente: no re-descarga si existen.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const map = JSON.parse(readFileSync(join(root, "data", "free-exercise-db-map.json"), "utf8"));
const out = join(root, "public", "exercises");
mkdirSync(out, { recursive: true });
const BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

let n = 0;
for (const [id, fedb] of Object.entries(map)) {
  if (id.startsWith("_")) continue;
  for (const i of [0, 1]) {
    const file = join(out, `${id}-${i}.jpg`);
    if (existsSync(file) && !process.argv.includes("--force")) continue;
    const res = await fetch(`${BASE}/${encodeURIComponent(fedb)}/${i}.jpg`);
    if (!res.ok) throw new Error(`${fedb}/${i}.jpg -> HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf).resize({ width: 560, withoutEnlargement: true }).jpeg({ quality: 74, progressive: true, mozjpeg: true }).toFile(file);
    n++;
  }
}
console.log(`OK: ${n} fotos nuevas en ${out}`);
