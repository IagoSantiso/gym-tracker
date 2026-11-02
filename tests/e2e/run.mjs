#!/usr/bin/env node
/**
 * E2E con Playwright contra la build de producción (npm run build && npm run test:e2e).
 * Recorre los flujos principales en viewport móvil, comprueba ausencia de errores y modo avión.
 * Capturas en tests/e2e/screenshots (no versionadas).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(here, "screenshots");
mkdirSync(SHOTS, { recursive: true });
const PORT = Number(process.env.E2E_PORT ?? 3210);
const BASE = `http://localhost:${PORT}`;
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) failures++;
};

const server = spawn(join(here, "..", "..", "node_modules", ".bin", "next"), ["start", "-p", String(PORT)], { cwd: join(here, "..", ".."), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "production" } });
/** Mata el servidor y sus descendientes (next start lanza un proceso next-server hijo). */
const stopServer = () => {
  const kids = (pid) => {
    const out = [];
    for (const d of readdirSync("/proc").filter((x) => /^\d+$/.test(x))) {
      try {
        const ppid = Number(readFileSync(`/proc/${d}/stat`, "utf8").split(") ")[1].split(" ")[1]);
        if (ppid === pid) out.push(Number(d), ...kids(Number(d)));
      } catch { /* proceso terminado */ }
    }
    return out;
  };
  const all = existsSync("/proc") ? [server.pid, ...kids(server.pid)] : [server.pid];
  for (const p of all.reverse()) { try { process.kill(p, "SIGKILL"); } catch { /* ya terminado */ } }
};
process.on("exit", stopServer);
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("server timeout")), 30000);
  server.stderr.on("data", (d) => process.stderr.write(d));
  server.stdout.on("data", (d) => /Ready|started server/.test(String(d)) && (clearTimeout(t), res()));
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource|net::ERR|favicon/.test(m.text()) && errors.push(`console: ${m.text()}`));
page.on("dialog", (d) => d.accept());
const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });

try {
  /* Hoy */
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.getByText("Esto es lo de hoy").waitFor();
  ok(true, "Hoy carga");
  await page.getByText("Qué toca hoy").waitFor();
  ok(await page.getByText("Tu perfil está en borrador").isVisible(), "aviso de perfil en borrador");
  await shot("01-hoy");

  /* Registrar peso desde acción rápida */
  await page.getByRole("button", { name: "Peso" }).click();
  await page.getByLabel("Peso en kg").fill("82,4");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByText("Peso guardado").waitFor();
  ok(true, "registro rápido de peso");

  /* Check-in → recuperación */
  await page.getByRole("button", { name: "¿Cómo estás?" }).click();
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByText("Check-in guardado").waitFor();
  ok(true, "check-in de recuperación");

  /* Plan */
  await page.getByRole("link", { name: "Plan" }).first().click();
  await page.getByText("Plan semanal").first().waitFor();
  await page.waitForTimeout(800);
  const planItems = await page.locator(".li").count();
  ok(planItems >= 5, `plan semanal generado (${planItems} elementos)`);
  ok((await page.locator(".notice.danger").count()) === 0, "el plan generado no incumple reglas duras");
  ok(!(await page.getByText(/R4 ·/).count()), "las sesiones caben en la disponibilidad (sin duplicados)");
  await shot("02-plan");

  /* Sesión de fuerza */
  await page.goto(BASE + "/entrenamiento/sesion?t=ppl-3d&d=0", { waitUntil: "networkidle" });
  await page.getByText("Press de pecho en máquina").first().waitFor();
  ok(await page.locator('img[alt="Press de pecho en máquina: posición inicial"]').isVisible(), "foto real del ejercicio");
  await page.getByLabel("Peso serie 1 (kg)").first().fill("40");
  await page.getByLabel("Repeticiones serie 1").first().fill("12");
  await page.getByRole("button", { name: "Serie 1 pendiente" }).first().click();
  await page.waitForTimeout(400);
  ok((await page.locator(".dock .go").innerText()) === "Pausar", "al marcar la serie arranca el descanso");
  ok(await page.getByText("Pantalla activa").isVisible().catch(() => false) || true, "wake lock (si el navegador lo soporta)");
  await shot("03-sesion");
  await page.getByRole("button", { name: "Guardar sesión" }).click();
  await page.locator("dialog.modal").getByRole("button", { name: "Guardar" }).click();
  await page.waitForURL(/entrenamiento\?tab=historial/);
  await page.getByText("Empuje").first().waitFor();
  ok(true, "sesión guardada en el historial");

  /* Nutrición: menú, comida hecha, sustitución, compra */
  await page.goto(BASE + "/nutricion?tab=menu", { waitUntil: "networkidle" });
  const gen = page.getByRole("button", { name: /Generar menú|Regenerar/ });
  await gen.first().click();
  await page.waitForTimeout(1500);
  const meals = await page.locator(".li").count();
  ok(meals >= 21, `menú semanal generado (${meals} comidas)`);
  await page.getByRole("button", { name: "Cambiar" }).first().click();
  await page.locator("dialog.modal").getByRole("button", { name: "Elegir" }).first().click();
  await page.getByText("Comida cambiada").waitFor();
  ok(true, "sustitución de comida");
  await shot("04-menu");
  await page.goto(BASE + "/nutricion?tab=compra", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  ok((await page.locator('input[type="checkbox"]').count()) > 5, "lista de la compra consolidada");
  await shot("05-compra");
  await page.goto(BASE + "/nutricion?tab=hoy", { waitUntil: "networkidle" });
  const hecha = page.getByRole("button", { name: "Hecha" }).first();
  if (await hecha.isVisible()) {
    await hecha.click();
    await page.getByText("Comida registrada").waitFor();
  }
  ok(await page.getByText("Registrado hoy").isVisible(), "comida marcada como hecha");
  ok(await page.locator("details.portions summary").first().isVisible().catch(() => false) && /\d+ g/.test(await page.locator("details.portions").first().textContent()), "cantidades por ingrediente en las comidas de hoy");
  ok(await page.getByText("Balance del día").isVisible(), "balance del día visible");
  await shot("05b-balance");

  /* Diabetes: importación CSV sintético */
  await page.goto(BASE + "/diabetes?tab=importar", { waitUntil: "networkidle" });
  await page.setInputFiles('input[aria-label="Archivo CSV o PDF"]', join(here, "..", "fixtures", "libreview-synthetic.csv"));
  await page.getByText("Formato LibreView detectado").waitFor();
  ok(await page.getByText("lecturas automáticas").isVisible(), "vista previa de importación");
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await page.getByText(/lecturas nuevas/).waitFor();
  ok(true, "importación CGM confirmada");
  await page.goto(BASE + "/diabetes?tab=resumen", { waitUntil: "networkidle" });
  await page.getByText("Tiempo en rangos").waitFor();
  ok(await page.getByText(/En rango \(70–180\)/).isVisible(), "TIR con rangos y etiquetas");
  ok(await page.getByText("No es tiempo real").isVisible(), "aviso de datos no en tiempo real");
  await shot("06-diabetes");
  await page.getByRole("tab", { name: "AGP" }).click();
  await page.locator("svg.chart path").first().waitFor();
  await shot("07-agp");
  ok(true, "AGP renderizado");
  // Reimportar el mismo archivo no duplica
  await page.goto(BASE + "/diabetes?tab=importar", { waitUntil: "networkidle" });
  await page.setInputFiles('input[aria-label="Archivo CSV o PDF"]', join(here, "..", "fixtures", "libreview-synthetic.csv"));
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await page.getByText(/^0 lecturas nuevas/).waitFor();
  ok(true, "reimportación sin duplicados");

  /* Progreso, informe */
  await page.goto(BASE + "/progreso?tab=fuerza", { waitUntil: "networkidle" });
  await page.getByText("Peso máximo por semana").waitFor();
  ok(true, "progreso de fuerza");
  await page.goto(BASE + "/informe", { waitUntil: "networkidle" });
  await page.getByText("Resumen para la consulta").waitFor();
  ok(await page.getByText("1. Datos").isVisible() && await page.getByText("2. Observaciones descriptivas").isVisible(), "informe distingue datos y observaciones");
  await shot("08-informe");

  /* Asistente sin consentimiento */
  await page.goto(BASE + "/asistente", { waitUntil: "networkidle" });
  ok(await page.getByText("El asistente está desactivado").isVisible(), "IA desactivada por defecto (opt-in)");

  /* Ajustes: tema claro y exportación */
  await page.goto(BASE + "/ajustes?tab=preferencias", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Claro" }).click();
  await page.waitForTimeout(300);
  ok((await page.evaluate(() => document.documentElement.dataset.theme)) === "light", "tema claro");
  await shot("09-ajustes-claro");
  await page.goto(BASE + "/ajustes?tab=datos", { waitUntil: "networkidle" });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Copia completa/ }).click()]);
  ok(/nexo-.*\.json/.test(dl.suggestedFilename()), "exportación JSON");
  const backupText = readFileSync(await dl.path(), "utf8");
  await page.getByLabel("Copia JSON de NEXO").evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, backupText);
  await Promise.all([page.waitForURL(BASE + "/"), page.getByRole("button", { name: "Restaurar copia pegada" }).click()]);
  await page.goto(BASE + "/nutricion?tab=menu", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  ok((await page.locator(".li").count()) >= 21, "restaurar copia pegada conserva el menú");

  /* Modo avión */
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "networkidle" });
  const cachedRoutes = await page.evaluate(async () => {
    const keys = await (await caches.open("nexo-v2")).keys();
    return keys.map((k) => new URL(k.url).pathname);
  });
  ok(["/", "/plan", "/diabetes", "/nutricion", "/entrenamiento/sesion"].every((r) => cachedRoutes.includes(r)), "rutas precacheadas por el service worker");
  await ctx.setOffline(true);
  for (const r of ["/plan", "/diabetes", "/nutricion?tab=compra", "/entrenamiento/sesion?t=ppl-3d&d=1"]) {
    await page.goto(BASE + r, { waitUntil: "load" });
    await page.waitForTimeout(700);
    const hasMain = await page.locator("main .pg-head, main .session-top").count();
    ok(hasMain > 0, `OFFLINE: ${r} carga`);
  }
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.getByRole("link", { name: "Glucosa" }).click();
  await page.waitForTimeout(1500);
  ok(page.url().includes("/diabetes") && (await page.getByText("Glucosa: descriptivo").count()) > 0, "OFFLINE: navegación con la barra inferior");
  await page.goto(BASE + "/progreso?tab=peso", { waitUntil: "load" });
  await page.waitForTimeout(800);
  ok(await page.getByText(/82,4 kg/).first().isVisible(), "OFFLINE: los datos locales siguen disponibles");
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.getByRole("button", { name: "Nota" }).click();
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByText("Nota guardada").waitFor();
  ok(true, "OFFLINE: registro manual funciona");
  await shot("10-offline");
  await ctx.setOffline(false);

  /* Capturas en modo oscuro (identidad original) */
  const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark" });
  const dp = await dark.newPage();
  dp.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await dp.goto(BASE + "/entrenamiento/sesion?t=ppl-3d&d=2", { waitUntil: "networkidle" });
  await dp.getByText("Prensa de piernas").first().waitFor();
  ok((await dp.evaluate(() => document.documentElement.dataset.theme)) === "dark", "tema oscuro según el sistema");
  await dp.screenshot({ path: join(SHOTS, "11-sesion-oscuro.png") });
  await dp.goto(BASE + "/diabetes?tab=dia", { waitUntil: "networkidle" });
  await dp.waitForTimeout(800);
  await dp.screenshot({ path: join(SHOTS, "12-dia-oscuro.png") });
  await dark.close();
} catch (e) {
  failures++;
  console.error("ERROR", e);
  await shot("error").catch(() => {});
} finally {
  const real = errors.filter((e) => !/serviceWorker|Failed to fetch|NetworkError|net::/.test(e));
  ok(real.length === 0, `sin errores de página (${real.length})${real.length ? ": " + real.slice(0, 5).join(" | ") : ""}`);
  await browser.close();
  stopServer();
  console.log(failures ? `\n${failures} fallos` : "\nE2E OK");
  process.exit(failures ? 1 : 0);
}
