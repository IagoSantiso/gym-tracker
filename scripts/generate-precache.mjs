#!/usr/bin/env node
/**
 * Genera public/precache.json con los recursos estáticos que el service worker
 * guarda en la instalación (fotos de ejercicios, iconos, manifest).
 * Los chunks JS/CSS de Next llevan hash y los descubre el propio SW leyendo el HTML.
 * Se ejecuta automáticamente antes de `next build` (script "prebuild").
 */
import { readdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pub = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public");
const list = (dir) => (existsSync(join(pub, dir)) ? readdirSync(join(pub, dir)).sort() : []);

const urls = [
  "/",
  "/manifest.webmanifest",
  ...list("icons").map((f) => `/icons/${f}`),
  ...list("exercises").filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => `/exercises/${f}`),
];

writeFileSync(join(pub, "precache.json"), JSON.stringify({ urls }, null, 1));
console.log(`precache.json: ${urls.length} recursos`);
