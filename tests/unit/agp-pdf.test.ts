import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { agpSummaryRecord, hasAgpMetrics, parseAgpText } from "@/lib/domain/cgm/agp-pdf";
import { getDb, NexoDB, setDbForTests, tbl } from "@/lib/db/db";
import { all, patch, put } from "@/lib/db/repo";
import { ensureInitialized, resetInitForTests } from "@/lib/db/init";
import { agpPdfReports, deleteImport, originalPdf, saveAgpPdfImport } from "@/lib/services/cgm";
import { executeTool } from "@/lib/ai/client-tools";

const fixture = readFileSync(new URL("../fixtures/agp-synthetic.txt", import.meta.url), "utf8");
describe("PDF de LibreLink/LibreView", () => {
  it("distingue resultados de los objetivos y percentiles de las curvas", () => {
    expect(parseAgpText(fixture)).toMatchObject({ pctVeryHigh: 8, pctHigh: 24, pctInRange: 65, pctLow: 2, pctVeryLow: 1, meanMgdl: 154, gmi: 7, cv: 33.2, activePct: 96, periodStartDate: "2026-03-04", periodEndDate: "2026-03-17", rangeLowMgdl: 70, rangeHighMgdl: 180, warnings: [] });
  });
  it("encuentra el AGP después de la página 10 sin mezclar otras páginas o periodos", () => {
    const text = [...Array(11).fill("Resumen mensual Glucosa promedio 300 mg/dL"), fixture, "Glucosa promedio 250 mg/dL"].join("\f");
    expect(parseAgpText(text)).toMatchObject({ sourcePage: 12, meanMgdl: 154 });
    expect(parseAgpText(`${fixture}\f${fixture.replace("154 mg/dL", "200 mg/dL")}`).warnings).toHaveLength(1);
  });
  it("admite las fechas y unidades del informe, sin usar la fecha de nacimiento", () => {
    const s = parseAgpText(`Fecha de nacimiento: 06/15/1984\fInforme AGP 4 de marzo de 2026 - 17 de marzo de 2026 Glucosa promedio 8,6 mmol/L Tiempo en rangos Muy alto >13,9 mmol/L 8% Alto 10,1-13,9 mmol/L 24% Intervalo objetivo 3,9-10,0 mmol/L 65% Bajo 3,0-3,8 mmol/L 2% Muy bajo <3,0 mmol/L 1%`);
    expect(s.periodStartDate).toBe("2026-03-04");
    expect(s.periodEndDate).toBe("2026-03-17");
    expect(s.meanMgdl).toBeCloseTo(154.934, 2);
    expect(s.rangeHighMgdl).toBeCloseTo(180.156, 2);
    expect(s.reportedUnit).toBe("mmol/L");
    expect(parseAgpText("AGP Report March 4, 2026 - March 17, 2026 Average Glucose 154 mg/dL").periodStartDate).toBe("2026-03-04");
  });
  it("no guarda objetivos solos, curvas ni valores inválidos como resultados", () => {
    const s = parseAgpText("Informe AGP Intervalo objetivo 70-180 mg/dL Mayor que 70% Por debajo 70 mg/dL Menor que 4% Percentiles 95% 75% 50% 25% 5%");
    expect(hasAgpMetrics(s)).toBe(false);
    expect(parseAgpText(fixture.replace("65%", "95%")).pctInRange).toBeUndefined();
    expect(parseAgpText(fixture.replace("96%", "196%")).activePct).toBeUndefined();
    expect(parseAgpText(fixture.replace("marzo 17, 2026", "febrero 30, 2026")).periodEndDate).toBeUndefined();
  });
  it("no convierte datos ausentes en cero ni permite nombres o texto terapéutico en el resumen", () => {
    const s = parseAgpText("Informe AGP Glucosa promedio 154 mg/dL");
    expect(s.pctLow).toBeUndefined();
    expect(agpSummaryRecord({ ...s, patientName: "Persona de prueba", treatment: "Texto privado" } as never)).not.toHaveProperty("patientName");
    expect(JSON.stringify(agpSummaryRecord(s))).not.toContain("Texto privado");
  });
});

let seq = 0;
describe("persistencia y uso de informes PDF", () => {
  beforeEach(async () => {
    setDbForTests(new NexoDB(`pdf-${++seq}`)); resetInitForTests(); await getDb().open(); await ensureInitialized();
  });
  const file = (hash = "pdf-test") => ({ name: "Informe de prueba.pdf", size: 8, hash, bytes: new TextEncoder().encode("%PDF-1.4").buffer, keepRaw: true, timezone: "Europe/Madrid" });
  it("guarda fechas, hash, métricas y original cifrado, sin fabricar lecturas ni eventos", async () => {
    const result = await saveAgpPdfImport(parseAgpText(fixture), file());
    const imp = (await tbl("cgm_imports").get(result.importId))!;
    expect(imp).toMatchObject({ format: "agp_pdf", fileSize: 8, fileHash: "pdf-test", rawStored: true, readingsCount: 0 });
    expect(imp.periodStart).toBe("2026-03-03T23:00:00.000Z");
    expect(imp.periodEnd).toBe("2026-03-17T23:00:00.000Z");
    expect(await all("cgm_readings")).toHaveLength(0);
    expect(await all("glucose_events")).toHaveLength(0);
    expect(await (await originalPdf(result.importId)).text()).toBe("%PDF-1.4");
    const raw = (await all("raw_files"))[0];
    expect(new TextDecoder().decode(raw.data)).not.toContain("%PDF");
  });
  it("reimportar (incluso a la vez) no duplica el informe; se puede borrar e importar de nuevo", async () => {
    const results = await Promise.all([saveAgpPdfImport(parseAgpText(fixture), file()), saveAgpPdfImport(parseAgpText(fixture), file())]);
    expect(results.map((r) => r.duplicate)).toEqual([false, true]);
    expect(await all("cgm_imports")).toHaveLength(1);
    await deleteImport(results[0].importId);
    expect(await agpPdfReports()).toHaveLength(0);
    expect(await all("raw_files")).toHaveLength(0);
    expect((await saveAgpPdfImport(parseAgpText(fixture), file())).duplicate).toBe(false);
  });
  it("rechaza un documento sin métricas y permite no conservar el original", async () => {
    await expect(saveAgpPdfImport(parseAgpText("Informe AGP"), file())).rejects.toThrow(/No se reconocen/);
    expect(await all("cgm_imports")).toHaveLength(0);
    const r = await saveAgpPdfImport(parseAgpText(fixture), { ...file(), keepRaw: false });
    expect(await all("raw_files")).toHaveLength(0);
    expect((await tbl("cgm_imports").get(r.importId))!.rawStored).toBe(false);
  });
  it("el asistente ve solo métricas agregadas y su periodo real, sin nombre de archivo ni terapias", async () => {
    await saveAgpPdfImport(parseAgpText(fixture), { ...file(), name: "Nombre personal privado.pdf", keepRaw: false });
    for (const kind of ["ai_assistant", "ai_cgm"] as const) await put("consents", { id: kind, kind, granted: true, grantedAt: null, revokedAt: null, version: 1 });
    const r = await executeTool({ id: "pdf", name: "get_cgm_period_summary", input: { days: 7 } });
    const data = JSON.parse(r.content);
    expect(data).toMatchObject({ available: true, individual_readings: false, requested_days: 7 });
    expect(data.pdf_reports[0]).toMatchObject({ meanMgdl: 154, pctInRange: 65, periodStartDate: "2026-03-04" });
    expect(r.content).not.toContain("Nombre personal");
    expect(data).not.toHaveProperty("episodes");
  });
  it("ordena informes por periodo del documento, no por la fecha de subida", async () => {
    const a = await saveAgpPdfImport(parseAgpText(fixture), { ...file("new"), keepRaw: false });
    await saveAgpPdfImport(parseAgpText(fixture.replaceAll("marzo", "febrero")), { ...file("old"), keepRaw: false });
    expect((await agpPdfReports())[0].id).toBe(a.importId);
    await patch("cgm_imports", a.importId, { deletedAt: new Date().toISOString() });
    expect(await agpPdfReports()).toHaveLength(1);
  });
});
