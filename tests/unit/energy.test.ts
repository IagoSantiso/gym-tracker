import { describe, expect, it } from "vitest";
import { compensationOption, energyDay, enduranceKcal, treadmillMet } from "@/lib/domain/nutrition/energy";

describe("balance energético", () => {
  it("MET de cinta coherentes con ACSM", () => {
    expect(treadmillMet(5.5, 6)).toBeGreaterThan(5.5);
    expect(treadmillMet(5.5, 6)).toBeLessThan(7.5);
    expect(treadmillMet(8, 1)).toBeGreaterThan(8);
    expect(treadmillMet(8, 1)).toBeLessThan(10);
  });
  it("kcal netas de una carrera suave de 30 min ≈ 250–350 para 70 kg", () => {
    const k = enduranceKcal({ sport: "run", durationSec: 1800, rpe: 4, treadmillSpeedKmh: null, treadmillInclinePct: null, whileWorking: false }, 70);
    expect(k).toBeGreaterThan(180);
    expect(k).toBeLessThan(350);
  });
  it("veredicto del día según balance consumido − gastado frente al déficit buscado", () => {
    const base = { weightKg: 75, bmrMid: 1700, steps: 8000, exercise: [{ label: "Carrera", kcal: 300 }], plannedRestKcal: 0, targetDeficit: 400 };
    const spent = energyDay({ ...base, intakeKcal: 0 }).spent;
    expect(spent).toBeGreaterThan(2400);
    expect(energyDay({ ...base, intakeKcal: spent - 400 }).verdict).toBe("on_track");
    expect(energyDay({ ...base, intakeKcal: spent + 200 }).verdict).toBe("over");
    expect(energyDay({ ...base, intakeKcal: spent - 1200 }).verdict).toBe("under");
    expect(energyDay({ ...base, weightKg: null, intakeKcal: 1000 }).verdict).toBe("unknown");
  });
  it("compensación acotada: ≤ % configurado, 10–30 min, suave; nada si no hay exceso o está desactivada", () => {
    const c = compensationOption({ excess: 500, weightKg: 70, maxPct: 30, hardSessionToday: false, exerciseMinToday: 0, hasDiabetes: true })!;
    expect(c.pct).toBeLessThanOrEqual(30);
    expect(c.activities).toHaveLength(2);
    for (const a of c.activities) { expect(a.minutes).toBeGreaterThanOrEqual(10); expect(a.minutes).toBeLessThanOrEqual(30); }
    expect(c.activities[1].minutes).toBeLessThanOrEqual(20); // trote suave ~15 min
    expect(c.restForMeals).toBeGreaterThan(300);
    expect(c.notes.join(" ")).toMatch(/protocolo/);
    expect(c.notes.join(" ")).not.toMatch(/\d+\s?(u|ui|unidades)\b/);
    expect(compensationOption({ excess: 2000, weightKg: 70, maxPct: 90, hardSessionToday: false, exerciseMinToday: 0, hasDiabetes: false })!.activities.every((a) => a.minutes <= 30)).toBe(true);
    expect(compensationOption({ excess: 100, weightKg: 70, maxPct: 30, hardSessionToday: false, exerciseMinToday: 0, hasDiabetes: false })).toBeNull();
    expect(compensationOption({ excess: 500, weightKg: 70, maxPct: 0, hardSessionToday: false, exerciseMinToday: 0, hasDiabetes: false })).toBeNull();
    expect(compensationOption({ excess: 500, weightKg: 70, maxPct: 30, hardSessionToday: true, exerciseMinToday: 0, hasDiabetes: false })!.activities).toHaveLength(1);
  });
});

describe("cinta de escritorio", () => {
  it("también suma, según velocidad; sin velocidad se asume paseo lento", async () => {
    const { enduranceKcal, sessionSteps } = await import("@/lib/domain/nutrition/energy");
    const desk = (speed: number | null) => enduranceKcal({ sport: "treadmill", durationSec: 3600, rpe: 2, treadmillSpeedKmh: speed, treadmillInclinePct: 0, whileWorking: true }, 75);
    expect(desk(2)).toBeGreaterThan(50);
    expect(desk(4)).toBeGreaterThan(desk(2));
    expect(desk(null)).toBeGreaterThan(80);
    expect(sessionSteps({ sport: "treadmill", durationSec: 3600, distanceM: null, treadmillSpeedKmh: 3, steps: null })).toBe(3900);
  });
});

describe("día en curso", () => {
  it("no marca «te quedas corto» mientras el día sigue abierto", async () => {
    const { energyDay } = await import("@/lib/domain/nutrition/energy");
    const base = { weightKg: 75, bmrMid: 1700, steps: null, exercise: [], plannedRestKcal: 0, targetDeficit: 400, intakeKcal: 600 };
    expect(energyDay({ ...base, dayClosed: false }).verdict).toBe("in_progress");
    expect(energyDay({ ...base, dayClosed: false }).message).toMatch(/te quedan/);
    expect(energyDay({ ...base, dayClosed: true }).verdict).toBe("under");
  });
});
