#!/usr/bin/env node
/**
 * Extrae las fotos base64 embebidas en el HTML original (const IMGS={...})
 * a /public/exercises/<id>-0.jpg (posición inicial) y <id>-1.jpg (final).
 *
 * Uso: node scripts/extract-images.mjs [ruta/al/archivo.html]
 * Por defecto lee legacy/index.html.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(process.argv[2] ?? join(root, "legacy", "index.html"));
const outDir = join(root, "public", "exercises");

const html = readFileSync(input, "utf8");
const start = html.indexOf("const IMGS=");
if (start === -1) throw new Error(`No se encontró "const IMGS=" en ${input}`);

// El objeto es JSON válido: va desde la primera "{" hasta el ";" que cierra la sentencia.
const open = html.indexOf("{", start);
const end = html.indexOf("};", open);
if (open === -1 || end === -1) throw new Error("No se pudo delimitar el objeto IMGS");
const imgs = JSON.parse(html.slice(open, end + 1));

mkdirSync(outDir, { recursive: true });

let count = 0;
let bytes = 0;
for (const [id, list] of Object.entries(imgs)) {
  list.forEach((dataUri, i) => {
    const m = /^data:image\/(jpeg|jpg);base64,(.+)$/s.exec(dataUri);
    if (!m) throw new Error(`Formato inesperado en ${id}[${i}]: ${dataUri.slice(0, 40)}`);
    const buf = Buffer.from(m[2], "base64");
    // Comprobación: cabecera JPEG (FF D8 FF)
    if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
      throw new Error(`${id}[${i}] no es un JPEG válido`);
    }
    writeFileSync(join(outDir, `${id}-${i}.jpg`), buf);
    count++;
    bytes += buf.length;
  });
}

console.log(`OK: ${count} imágenes de ${Object.keys(imgs).length} ejercicios -> ${outDir} (${(bytes / 1024).toFixed(0)} KB)`);
