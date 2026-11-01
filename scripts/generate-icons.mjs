#!/usr/bin/env node
/**
 * Genera los iconos PWA (PNG) a partir de un SVG vectorial con sharp.
 *   public/icons/icon-192.png, icon-512.png          (purpose: any, esquinas redondeadas)
 *   public/icons/icon-maskable-512.png               (purpose: maskable, a sangre, glifo en zona segura)
 *   public/icons/apple-touch-icon.png (180)          (iOS aplica su propia máscara)
 *   public/favicon.ico no se genera: Next sirve app/icon si se añade; los PNG bastan para el manifest.
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "public", "icons");
mkdirSync(out, { recursive: true });

const BG = "#0c110e";
const LIME = "#c5f36b";

// Mancuerna centrada en un lienzo de 512×512
const glyph = `
  <g fill="${LIME}">
    <rect x="150" y="238" width="212" height="36" rx="10"/>
    <rect x="112" y="172" width="42" height="168" rx="14"/>
    <rect x="358" y="172" width="42" height="168" rx="14"/>
    <rect x="72"  y="208" width="36" height="96"  rx="12"/>
    <rect x="404" y="208" width="36" height="96"  rx="12"/>
  </g>`;

const svg = (rounded) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ""} fill="${BG}"/>
  <circle cx="256" cy="256" r="190" fill="${LIME}" opacity=".08"/>
  ${glyph}
</svg>`;

const render = (rounded, size, file) =>
  sharp(Buffer.from(svg(rounded))).resize(size, size).png().toFile(join(out, file));

await Promise.all([
  render(true, 192, "icon-192.png"),
  render(true, 512, "icon-512.png"),
  render(false, 512, "icon-maskable-512.png"),
  render(false, 180, "apple-touch-icon.png"),
]);
writeFileSync(join(out, "icon.svg"), svg(true));
console.log("Iconos generados en", out);
