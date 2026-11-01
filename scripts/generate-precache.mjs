#!/usr/bin/env node
/**
 * Genera public/precache.json con los recursos estáticos que el service worker
 * guarda en la instalación (fotos de ejercicios, iconos, manifest).
 * Los chunks JS/CSS de Next llevan hash y los descubre el propio SW leyendo el HTML.
 * Se ejecuta automáticamente antes de `next build` (script "prebuild").
 */
import { readdirSync, writeFileSync, existsSync, copyFileSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pub = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public");
const list = (dir) => (existsSync(join(pub, dir)) ? readdirSync(join(pub, dir)).sort() : []);

// Worker de pdf.js servido desde /public (importación de informes AGP en PDF)
const worker = join(pub, "..", "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
if (existsSync(worker)) copyFileSync(worker, join(pub, "pdf.worker.min.mjs"));

// Todas las rutas estáticas de app/**/page.tsx (sin segmentos dinámicos) se precachean para uso offline
const appDir = join(pub, "..", "app");
const routes = [];
const walk = (dir, rel) => {
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) {
      if (f === "api" || f.startsWith("[") || f.startsWith("(") || f.startsWith("_")) continue;
      walk(full, `${rel}/${f}`);
    } else if (f === "page.tsx") routes.push(rel || "/");
  }
};
walk(appDir, "");

const urls = [
  ...routes.sort(),
  "/manifest.webmanifest",
  ...(existsSync(join(pub, "pdf.worker.min.mjs")) ? ["/pdf.worker.min.mjs"] : []),
  ...list("icons").map((f) => `/icons/${f}`),
  ...list("exercises").filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => `/exercises/${f}`),
];

writeFileSync(join(pub, "precache.json"), JSON.stringify({ routes: routes.sort(), urls }, null, 1));
console.log(`precache.json: ${urls.length} recursos`);
