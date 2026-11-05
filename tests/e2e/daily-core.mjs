/** Complete everyday workflow, synthetic records only. */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const port = 3221,
  base = `http://localhost:${port}`;
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let browser;
try {
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(Error("Server timeout")), 30000);
    server.stdout.on("data", (d) => {
      if (/Ready/.test(String(d))) {
        clearTimeout(t);
        res();
      }
    });
    server.stderr.on("data", (d) => process.stderr.write(d));
  });
  browser = await chromium.launch();
  const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Tu balance de hoy" }).waitFor();
  assert.deepEqual(
    await page
      .locator('nav[aria-label="Secciones principales"] a')
      .allTextContents(),
    ["Hoy", "Entreno", "Comida", "Evolución"],
  );
  await page.getByRole("button", { name: "Añadir comida" }).click();
  await page
    .getByRole("button", { name: "Registro rápido", exact: true })
    .click();
  await page.getByLabel("Qué has comido").fill("Almuerzo sintético");
  await page.getByLabel("Energía", { exact: true }).fill("600");
  await page
    .getByRole("button", { name: "Guardar comida", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Editar Almuerzo sintético" })
    .waitFor();
  await page.getByText("Balance final pendiente", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Confirmar día completo", exact: true })
    .click();
  await page.getByText("Registro confirmado", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Editar Almuerzo sintético" }).click();
  await page.getByLabel("Cantidad relativa").fill("0,5");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await page.getByText("Día en curso", { exact: true }).waitFor();
  assert.match(await page.locator(".energy-focus").textContent(), /300/);
  await page.getByRole("button", { name: "Editar Almuerzo sintético" }).click();
  await page
    .getByRole("button", { name: "Guardar favorita", exact: true })
    .click();
  await page.getByRole("button", { name: "Añadir comida" }).click();
  await page
    .getByRole("button", { name: /Almuerzo sintético.*Repetir/ })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".food-diary .diary-row").length === 2,
  );
  await page.waitForFunction(() =>
    document.querySelector(".energy-focus")?.textContent.includes("600"),
  );
  await page
    .locator('nav[aria-label="Secciones principales"]')
    .getByRole("link", { name: "Comida", exact: true })
    .click();
  await page.getByRole("heading", { name: "Tu diario de comida" }).waitFor();
  await page.getByRole("button", { name: "Añadir comida" }).click();
  await page.getByLabel("Buscar alimento o plato").fill("huevo");
  await page.locator(".search-results button").first().click();
  await page.getByLabel("Cantidad de alimento").fill("100");
  await page
    .getByRole("button", { name: "Añadir al plato", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Guardar comida", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".food-diary .diary-row").length === 3,
  );
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Añadir actividad" }).click();
  await page
    .getByRole("button", { name: "Fuerza / abdominales", exact: true })
    .click();
  await page.getByLabel("Buscar ejercicio", { exact: true }).fill("plancha");
  await page
    .getByLabel("Ejercicio realizado", { exact: true })
    .selectOption({ index: 1 });
  await page.getByRole("button", { name: "Por tiempo", exact: true }).click();
  await page.getByLabel("Segundos realizados").fill("30");
  await page
    .getByRole("button", { name: "Guardar ejercicio realizado", exact: true })
    .click();
  await page
    .locator('.today-session[data-status="completed"]')
    .first()
    .waitFor();
  await page
    .locator('.today-session[data-status="completed"]>summary')
    .first()
    .click();
  await page.getByText("30 s · 30 s · 30 s", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Corregir sesión" }).click();
  await page.getByLabel("Duración total (min)", { exact: true }).fill("8");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await page
    .locator(".today-session")
    .getByText("8 min", { exact: true })
    .waitFor();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `no overflow ${width}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "tests/e2e/screenshots/daily-core-mobile.png",
    fullPage: true,
  });
  await page.goto(base + "/progreso", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Tu semana, en contexto" }).waitFor();
  await page.screenshot({
    path: "tests/e2e/screenshots/daily-core-progress.png",
    fullPage: true,
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Añadir comida" }).click();
  await page
    .getByRole("button", { name: /Almuerzo sintético.*Repetir/ })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".food-diary .diary-row").length === 4,
  );
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".food-diary .diary-row").count(), 4);
  assert.deepEqual(errors, []);
  console.log(
    "PASS daily core: navigation, food save/edit/favorite/repeat/search, confirmation invalidation, timed activity, correction, responsive layouts, offline persistence",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
