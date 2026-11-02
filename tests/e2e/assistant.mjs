/** Flujo móvil con proveedor simulado: foto → petición multimodal, voz → texto revisable. */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");
const port = Number(process.env.E2E_ASSISTANT_PORT ?? 3211);
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
  const response = await fetch(base + "/asistente");
  assert.match(response.headers.get("permissions-policy"), /microphone=\(self\)/);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await context.addInitScript(() => {
    window.SpeechRecognition = class {
      start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: "Prepara una cena con mi nevera" }]] }); this.onend?.(); }, 30); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const requests = [];
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { configured: true, needsLogin: false, provider: "anthropic", model: "simulado" } }));
  await page.route("**/api/ai/chat", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { item: { role: "assistant", text: "He recibido los adjuntos. Puedo proponer una cena con tus productos.", toolCalls: [], provider: "simulado", raw: null } } });
  });
  await page.goto(base + "/asistente");
  await page.getByRole("checkbox", { name: /nutrición/i }).check();
  const send = page.getByRole("button", { name: "Enviar", exact: true });
  await page.getByRole("button", { name: "Dictar", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Mensaje para el asistente"]')?.value.includes("mi nevera"));
  assert.equal(requests.length, 0, "El dictado no se envía sin revisión");
  const text = page.getByLabel("Mensaje para el asistente");
  await text.fill("");
  await page.locator('input[type="file"]').nth(1).setInputFiles({ name: "nevera.png", mimeType: "image/png", buffer: readFileSync("public/icons/icon-192.png") });
  await page.getByRole("button", { name: "Quitar nevera.png" }).waitFor();
  await page.getByRole("button", { name: "Quitar nevera.png" }).click();
  assert.equal(await send.isDisabled(), true);
  await page.locator('input[type="file"]').nth(1).setInputFiles([
    { name: "nevera.png", mimeType: "image/png", buffer: readFileSync("public/icons/icon-192.png") },
    { name: "etiqueta.txt", mimeType: "text/plain", buffer: Buffer.from("Atún en aceite, 200 kcal por 100 g") },
  ]);
  await page.getByRole("button", { name: "Quitar etiqueta.txt" }).waitFor();
  assert.equal(await send.isEnabled(), true, "Se puede enviar solo adjuntos");
  mkdirSync("tests/e2e/screenshots", { recursive: true });
  await page.screenshot({ path: "tests/e2e/screenshots/assistant-attachments.png" });
  await send.click();
  await page.getByText("He recibido los adjuntos.", { exact: false }).waitFor();
  assert.equal(requests.length, 1);
  const files = requests[0].items.at(-1).attachments;
  assert.equal(files[0].kind, "image");
  assert.equal(files[0].mediaType, "image/jpeg", "Las imágenes se comprimen y normalizan");
  assert.equal(files[1].text, "Atún en aceite, 200 kcal por 100 g");
  await page.waitForFunction(async () => {
    const db = await new Promise((resolve) => { const r = indexedDB.open("nexo"); r.onsuccess = () => resolve(r.result); });
    const rows = await new Promise((resolve) => { const r = db.transaction("ai_conversations").objectStore("ai_conversations").getAll(); r.onsuccess = () => resolve(r.result); });
    db.close();
    return rows.length > 0 && !JSON.stringify(rows).includes('"attachments"') && JSON.stringify(rows).includes("Adjuntos no conservados");
  });
  await page.getByRole("button", { name: "Nueva", exact: true }).click();
  await page.locator('input[type="file"]').nth(1).setInputFiles({ name: "archivo.exe", mimeType: "application/octet-stream", buffer: Buffer.from("no") });
  await page.getByRole("alert").filter({ hasText: "Formato no admitido" }).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS asistente móvil: dictado revisable, imagen sin texto, quitar adjuntos, normalización, envío, privacidad y formatos no admitidos");
} finally {
  await browser?.close();
  try { process.kill(-server.pid, "SIGKILL"); } catch { /* ya terminado */ }
}
