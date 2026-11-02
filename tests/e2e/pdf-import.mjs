/** Prueba de importación PDF real en navegador, con documento sintético sin datos personales. */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { syntheticAgpPdf } from "../fixtures/make-agp-pdf.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const port = Number(process.env.E2E_PDF_PORT ?? 3212);
const base = `http://localhost:${port}`;
const server = spawn("node_modules/.bin/next", ["start", "-p", String(port)], { stdio: ["ignore", "pipe", "pipe"], detached: true });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Servidor no disponible")), 30000);
    server.once("exit", () => { clearTimeout(timer); reject(new Error("Servidor terminado")); });
    server.stdout.on("data", (data) => { if (/Ready/.test(String(data))) { clearTimeout(timer); resolve(); } });
    server.stderr.on("data", (data) => process.stderr.write(data));
  });
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const payload = { name: "informe-sintetico.pdf", mimeType: "application/pdf", buffer: syntheticAgpPdf() };
  const upload = async () => {
    await page.goto(base + "/diabetes?tab=importar");
    await page.getByLabel("Archivo CSV o PDF").setInputFiles(payload);
    await page.getByRole("button", { name: "Confirmar importación PDF", exact: true }).waitFor({ timeout: 45000 });
    assert.equal(await page.getByText("65 %", { exact: true }).count(), 2);
    await page.getByRole("button", { name: "Confirmar importación PDF", exact: true }).click();
  };
  await upload();
  await page.getByText("Informe PDF guardado. Ya puedes verlo en Resumen", { exact: false }).waitFor();
  await page.goto(base + "/diabetes?tab=resumen");
  await page.getByRole("heading", { name: "Informe de glucosa importado (PDF)", exact: true }).waitFor();
  assert.equal(await page.getByText("65 %", { exact: true }).count(), 2);
  assert.equal(await page.getByText("154 mg/dL", { exact: true }).count(), 1);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Descargar PDF original", exact: true }).click()]);
  assert.equal(download.suggestedFilename(), payload.name);
  await upload();
  await page.getByText("El PDF ya estaba importado: no se ha duplicado", { exact: false }).waitFor();
  const counts = await page.evaluate(async () => {
    const db = await new Promise((resolve) => { const r = indexedDB.open("nexo"); r.onsuccess = () => resolve(r.result); });
    const count = (name) => new Promise((resolve) => { const r = db.transaction(name).objectStore(name).count(); r.onsuccess = () => resolve(r.result); });
    const result = { reports: await count("cgm_imports"), readings: await count("cgm_readings"), events: await count("glucose_events"), rawFiles: await count("raw_files") };
    db.close(); return result;
  });
  assert.deepEqual(counts, { reports: 1, readings: 0, events: 0, rawFiles: 1 });
  await page.goto(base + "/informe");
  await page.getByRole("heading", { name: "Informe de glucosa importado (PDF)", exact: true }).waitFor();
  await page.goto(base + "/");
  await page.getByRole("link", { name: "Ver métricas del informe", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS PDF LibreLink: página 12, previsualización, métricas publicadas, persistencia, original cifrado, duplicados, informe/Inicio y ninguna lectura inventada");
} finally {
  await browser?.close();
  try { process.kill(-server.pid, "SIGKILL"); } catch { /* terminado */ }
}
