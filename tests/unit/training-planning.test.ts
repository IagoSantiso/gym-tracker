import { describe, expect, it } from "vitest";
import { LIBRARY, alternativesFor } from "@/lib/domain/training/library";
import { adjustPrescription, detectPlateau, estimate1RM, isDeloadWeek, suggestNext, summarizeByExercise, weeklyVolumeByMuscle } from "@/lib/domain/training/progression";
import { SEED_TEMPLATES, parseReps } from "@/lib/domain/training/templates";
import { acwr, buildRunPlan, dailyLoads, paceGuide } from "@/lib/domain/training/endurance";
import { generateWeek } from "@/lib/domain/planning/generator";
import { validateWeek } from "@/lib/domain/planning/rules";
import { proposeEaseToday, proposeReschedule, validateOps } from "@/lib/domain/planning/adapt";
import { addDays } from "@/lib/domain/time";
import type { PlannedItem } from "@/lib/db/types";
import { existsSync } from "node:fs";

const S = (weightKg: number, reps: number, rir: number | null = 2) => ({ weightKg, reps, rir, completed: true, isWarmup: false });

describe("biblioteca", () => {
  it("cada ejercicio con fotos tiene sus dos imágenes", () => {
    for (const e of LIBRARY.filter((x) => x.photos)) {
      expect(existsSync(`public/exercises/${e.id}-0.jpg`), e.id).toBe(true);
      expect(existsSync(`public/exercises/${e.id}-1.jpg`), e.id).toBe(true);
    }
  });
  it("alternativas comparten músculo y evitan el mismo material", () => {
    const alts = alternativesFor("legpress");
    expect(alts.length).toBe(3);
    expect(alts.every((a) => a.primary.some((m) => ["quads", "glutes"].includes(m)))).toBe(true);
    expect(alts[0].equipment).not.toContain("machine");
  });
  it("rutinas semilla conservan el plan original", () => {
    const ppl = SEED_TEMPLATES.find((t) => t.id === "ppl-3d")!;
    expect(ppl.days.map((d) => d.title)).toEqual(["Empuje", "Tracción", "Piernas + core"]);
    expect(ppl.days[0].items[0]).toMatchObject({ exerciseId: "bench", sets: 3, repsMin: 8, repsMax: 12, restSec: 90 });
    expect(parseReps("8–10 por lado")).toEqual({ repsMin: 8, repsMax: 10, repsLabel: "8–10 por lado" });
  });
});

describe("progresión doble con RIR", () => {
  const target = { repsMin: 8, repsMax: 12, rir: 2 };
  it("sube si todas las series llegan al máximo con recámara", () => {
    const s = suggestNext([S(40, 12), S(40, 12), S(40, 13)], target, 2.5);
    expect(s).toMatchObject({ action: "increase", weightKg: 42.5 });
  });
  it("+1 kg en aislamiento con mancuernas", () => {
    expect(suggestNext([S(8, 15, 2), S(8, 15, 2)], { repsMin: 12, repsMax: 15, rir: 2 }, 1).weightKg).toBe(9);
  });
  it("mantiene si alguna serie no llega al máximo", () => {
    expect(suggestNext([S(40, 12), S(40, 10)], target, 2.5)).toMatchObject({ action: "hold", weightKg: 40 });
  });
  it("mantiene si llegó al máximo pero al fallo (RIR 0)", () => {
    expect(suggestNext([S(40, 12, 0), S(40, 12, 0)], target, 2.5).action).toBe("hold");
  });
  it("ignora calentamientos y series no completadas; sin datos → empezar", () => {
    expect(suggestNext([{ ...S(20, 15), isWarmup: true }, { ...S(40, 12), completed: false }], target, 2.5).action).toBe("start");
  });
  it("e1RM (Epley) solo como estimación y con límites", () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 1);
    expect(estimate1RM(100, 5, 2)).toBeCloseTo(123.33, 1);
    expect(estimate1RM(100, 20)).toBeNull();
  });
  it("estancamiento y volumen por músculo", () => {
    const hist = summarizeByExercise(
      [1, 2, 3, 4, 5].flatMap((i) => [{ sessionId: `s${i}`, exerciseId: "bench", weightKg: i < 3 ? 40 + i * 2.5 : 45, reps: 10, rir: 2, completed: true, isWarmup: false }]),
      Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`s${i}`, `2026-10-0${i}`])),
    ).bench;
    expect(detectPlateau(hist).plateau).toBe(true);
    const v = weeklyVolumeByMuscle([{ exerciseId: "bench", completed: true, isWarmup: false }], (id) => LIBRARY.find((e) => e.id === id));
    expect(v.chest).toBe(1);
    expect(v.triceps).toBe(0.5);
  });
  it("descarga y adaptación", () => {
    expect(adjustPrescription(3, 2, { deload: true })).toEqual({ sets: 2, rir: 4, loadFactor: 0.9 });
    expect(adjustPrescription(3, 2, { adaptation: true }).sets).toBe(2);
    expect(isDeloadWeek(3, 4)).toBe(true);
    expect(isDeloadWeek(2, 4)).toBe(false);
  });
});

describe("resistencia", () => {
  it("plan de carrera prudente con descarga cada 4 semanas", () => {
    const plan = buildRunPlan({ distanceKm: 10, weeks: 8, daysPerWeek: 3, currentWeeklyMin: 120, level: "beginner", ref: { distanceKm: 5, timeSec: 1650 } });
    expect(plan).toHaveLength(8);
    expect(plan[3].recovery).toBe(true);
    expect(plan[3].totalMin).toBeLessThan(plan[2].totalMin);
    for (let i = 1; i < plan.length - 1; i++) if (!plan[i].recovery && !plan[i - 1].recovery) expect(plan[i].totalMin / plan[i - 1].totalMin).toBeLessThan(1.15);
    expect(plan[7].sessions[0].type).toBe("race");
    expect(paceGuide({ distanceKm: 5, timeSec: 1650 })!.easy[0]).toBeGreaterThan(330);
  });
  it("ACWR requiere historial y es solo descriptivo", () => {
    const loads = dailyLoads([{ date: "2026-10-30", durationSec: 3600, rpe: 5 }], []);
    expect(acwr(loads, "2026-11-01").ratio).toBeNull();
    const many = dailyLoads(Array.from({ length: 28 }, (_, i) => ({ date: addDays("2026-10-05", i), durationSec: 1800, rpe: i > 21 ? 8 : 4 })), []);
    const r = acwr(many, "2026-11-01");
    expect(r.ratio).toBeGreaterThan(1.3);
    expect(r.note).toMatch(/aproximación/);
  });
});

describe("planificador", () => {
  const avail = { 0: 60, 1: 60, 2: 60, 3: 60, 4: 60, 5: 120, 6: 120 };
  const runs = buildRunPlan({ distanceKm: 10, weeks: 8, daysPerWeek: 3, currentWeeklyMin: 120, level: "intermediate" })[1].sessions;
  const input = { weekStart: "2026-11-02", availability: avail, template: SEED_TEMPLATES[0], runSessions: runs, bike: { perWeek: 1, minutes: 60 }, lockedItems: [], lockedDays: [] };
  it("genera una semana sin violar reglas duras y con descanso", () => {
    const { items } = generateWeek(input);
    const v = validateWeek(items, { weekStart: input.weekStart, availability: avail });
    expect(v.filter((x) => x.severity === "error")).toEqual([]);
    expect(items.some((i) => i.kind === "rest")).toBe(true);
    expect(items.filter((i) => i.kind === "strength")).toHaveLength(3);
    expect(items.find((i) => i.runSpec?.type === "long")?.date).toMatch(/2026-11-0[78]/);
  });
  it("es determinista y respeta días bloqueados", () => {
    const a = generateWeek({ ...input, lockedDays: ["2026-11-02"] });
    expect(a.items.some((i) => i.date === "2026-11-02")).toBe(false);
    expect(generateWeek(input)).toEqual(generateWeek(input));
  });
  it("detecta días duros consecutivos y más de 2 duros en 3 días", () => {
    const hard = (date: string) => ({ date, kind: "run" as const, intensity: "hard" as const, durationMin: 40, title: "x" });
    const v = validateWeek([hard("2026-11-02"), hard("2026-11-03"), hard("2026-11-04")], { weekStart: "2026-11-02" });
    expect(v.map((x) => x.rule)).toEqual(expect.arrayContaining(["R1", "R5"]));
  });
  const mk = (over: Partial<PlannedItem>): PlannedItem => ({
    id: Math.random().toString(36).slice(2), createdAt: "", updatedAt: "", date: "2026-11-02", weekStart: "2026-11-02", kind: "strength",
    title: "Fuerza", intensity: "moderate", durationMin: 60, sortOrder: 0, status: "planned", locked: false, source: "rules", ...over,
  });
  it("recolocar una sesión perdida no junta duros ni acumula dos el mismo día", () => {
    const items = [
      mk({ id: "a", date: "2026-11-02", intensity: "hard", title: "Piernas" }),
      mk({ id: "b", date: "2026-11-04", intensity: "hard" }),
      mk({ id: "c", date: "2026-11-06", intensity: "hard" }),
      mk({ id: "r", date: "2026-11-07", kind: "rest", intensity: "rest", durationMin: 0 }),
    ];
    const p = proposeReschedule(items, "a", "2026-11-02")!;
    expect(p.requiresApproval).toBe(true);
    const moveTo = (p.ops[0] as unknown as { changes: { date: string } }).changes.date;
    expect(["2026-11-03", "2026-11-05"]).not.toContain(moveTo);
    expect(p.inverse).toBeTruthy();
    expect(validateOps(p.ops)).toEqual([]);
  });
  it("recuperación baja → propuesta suave reversible", () => {
    const items = [mk({ id: "h", intensity: "hard", durationMin: 60 })];
    const p = proposeEaseToday(items, "2026-11-02", { id: "c", createdAt: "", updatedAt: "", date: "2026-11-02", fatigue: 5, sleepHours: 5 })!;
    expect(p.reasons.length).toBe(2);
    expect((p.ops[0] as unknown as { changes: { durationMin: number } }).changes.durationMin).toBe(36);
    expect(proposeEaseToday(items, "2026-11-02", { id: "c", createdAt: "", updatedAt: "", date: "2026-11-02", fatigue: 2, sleepHours: 8 })).toBeNull();
  });
  it("las propuestas no pueden tocar configuración clínica", () => {
    expect(validateOps([{ op: "update", table: "diabetes_settings", id: "me", changes: { targetLow: 60 } }])).not.toEqual([]);
    expect(validateOps([{ op: "update", table: "goals", id: "me", changes: { manualKcal: 1200 } }])).not.toEqual([]);
  });
});
