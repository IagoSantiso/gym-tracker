import { describe, expect, it } from "vitest";
import { MGDL_PER_MMOL, formatGlucose, mgdlToMmol, mmolToMgdl, parseNum, round } from "@/lib/domain/units";
import { addDays, localDate, weekStartOf, weekdayOf, zonedWallToUtc } from "@/lib/domain/time";

describe("unidades de glucosa", () => {
  it("convierte mg/dL ↔ mmol/L con el factor 18,0156 y es reversible", () => {
    expect(mmolToMgdl(1)).toBeCloseTo(MGDL_PER_MMOL, 6);
    expect(mgdlToMmol(180)).toBeCloseTo(9.991, 3);
    for (const v of [39, 54, 70, 100, 180, 250, 400]) expect(mmolToMgdl(mgdlToMmol(v))).toBeCloseTo(v, 9);
  });
  it("formatea con la precisión de cada unidad", () => {
    expect(formatGlucose(100, "mg/dL")).toBe("100 mg/dL");
    expect(formatGlucose(100, "mmol/L")).toBe("5,6 mmol/L");
  });
  it("parsea números con coma decimal y miles", () => {
    expect(parseNum("5,6")).toBe(5.6);
    expect(parseNum("1.234,5")).toBe(1234.5);
    expect(parseNum("7.2")).toBe(7.2);
    expect(parseNum("")).toBeNull();
    expect(parseNum("HI")).toBeNull();
    expect(round(0.1 + 0.2, 2)).toBe(0.3);
  });
});

describe("zonas horarias (Europe/Madrid)", () => {
  const tz = "Europe/Madrid";
  it("convierte hora de pared normal", () => {
    const r = zonedWallToUtc({ year: 2026, month: 1, day: 15, hour: 10, minute: 0 }, tz);
    expect(new Date(r.ms).toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(r.ambiguous || r.nonexistent).toBe(false);
  });
  it("detecta la hora inexistente del cambio de primavera", () => {
    const r = zonedWallToUtc({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, tz);
    expect(r.nonexistent).toBe(true);
    expect(new Date(r.ms).toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });
  it("marca la hora ambigua de otoño y devuelve la primera ocurrencia", () => {
    const r = zonedWallToUtc({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 }, tz);
    expect(r.ambiguous).toBe(true);
    expect(new Date(r.ms).toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });
  it("aritmética de fechas de calendario", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(weekdayOf("2026-11-02")).toBe(0); // lunes
    expect(weekStartOf("2026-11-08")).toBe("2026-11-02");
    expect(localDate(Date.parse("2026-06-30T22:30:00Z"), tz)).toBe("2026-07-01");
  });
});
