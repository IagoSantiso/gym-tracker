#!/usr/bin/env node
/** Genera un CSV SINTÉTICO con formato LibreView (español, DD-MM-YYYY, mg/dL). Datos ficticios. */
import { writeFileSync } from "node:fs";
const pad = (n) => String(n).padStart(2, "0");
const lines = [
  "Datos de glucosa,Generado el,01-11-2026 08:00 UTC,Generado por,USUARIO SINTÉTICO",
  "Dispositivo,Número de serie,Sello de tiempo del dispositivo,Tipo de registro,Historial de glucosa mg/dL,Escaneo de glucosa mg/dL,Insulina de acción rápida (unidades),Carbohidratos (gramos),Notas",
];
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const start = Date.UTC(2026, 9, 18, 0, 0); // 18-10-2026 00:00 (hora de pared)
for (let i = 0; i < 14 * 96; i++) {
  const t = new Date(start + i * 15 * 60000);
  const h = t.getUTCHours() + t.getUTCMinutes() / 60;
  let v = 125 + 45 * Math.sin(((h - 9) / 24) * 2 * Math.PI) + (h > 13 && h < 16 ? 50 : 0) + (rnd() - 0.5) * 30;
  if (t.getUTCDate() % 5 === 0 && h > 3 && h < 4) v = 62; // algunas lecturas bajas nocturnas
  const stamp = `${pad(t.getUTCDate())}-${pad(t.getUTCMonth() + 1)}-${t.getUTCFullYear()} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
  if (i % 97 === 50) continue; // algún hueco
  lines.push(["FreeStyle Libre 2 Plus", "SINTETICO-0001", stamp, "0", Math.round(v), "", "", "", ""].join(","));
  if (i % 96 === 52) lines.push(["FreeStyle Libre 2 Plus", "SINTETICO-0001", stamp, "5", "", "", "", "60", ""].join(","));
}
writeFileSync(new URL("./libreview-synthetic.csv", import.meta.url), lines.join("\n") + "\n");
console.log("ok", lines.length);
