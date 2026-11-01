/** Agregación de datos para la revisión semanal y el informe de consulta. */
import { tbl } from "@/lib/db/db";
import { active, all } from "@/lib/db/repo";
import type { WeekData } from "@/lib/domain/review/weekly";
import { addDays, startOfLocalDay } from "@/lib/domain/time";
import { computeMetrics } from "@/lib/domain/cgm/metrics";
import { summarizeByExercise } from "@/lib/domain/training/progression";
import { findExercise } from "@/lib/domain/training/library";
import { weightTrend } from "@/lib/domain/nutrition/targets";
import { dailyLoads } from "@/lib/domain/training/endurance";
import { validateWeek } from "@/lib/domain/planning/rules";
import { readingsBetween } from "./cgm";
import { currentTargets } from "./targets";

export async function weekData(ws: string, tz: string): Promise<WeekData> {
  const we = addDays(ws, 6);
  const inW = (d: string) => d >= ws && d <= we;
  const items = (await tbl("planned_items").where("weekStart").equals(ws).toArray()).filter((i) => active(i) && i.kind !== "rest");
  const sessions = (await all("workout_sessions")).filter((s) => s.status === "completed");
  const sDates = Object.fromEntries(sessions.map((s) => [s.id, s.date]));
  const sets = await all("exercise_sets");
  const hist = summarizeByExercise(sets, sDates);
  const newBests: string[] = [];
  for (const [ex, h] of Object.entries(hist)) {
    const before = h.filter((x) => x.date < ws && x.best1RM != null).map((x) => x.best1RM!);
    const during = h.filter((x) => inW(x.date) && x.best1RM != null).map((x) => x.best1RM!);
    if (before.length && during.length && Math.max(...during) > Math.max(...before) * 1.01) newBests.push(findExercise(ex)?.name ?? ex);
  }
  const end = (await all("endurance_sessions")).filter((e) => inW(e.date));
  const weights = (await all("weight_entries")).filter((w) => inW(w.date));
  const trend = weightTrend((await all("weight_entries")).map((w) => ({ date: w.date, weightKg: w.weightKg })));
  const tStart = trend.filter((t) => t.date < ws).at(-1)?.trend;
  const tEnd = trend.filter((t) => t.date <= we).at(-1)?.trend;
  const logs = (await all("food_logs")).filter((l) => inW(l.date));
  const byDay = new Map<string, { p: number; f: number; c: number }>();
  logs.forEach((l) => {
    const d = byDay.get(l.date) ?? { p: 0, f: 0, c: 0 };
    byDay.set(l.date, { p: d.p + l.totals.proteinG, f: d.f + l.totals.fiberG, c: d.c + l.totals.carbsAvailableG });
  });
  const days = [...byDay.values()];
  const avg = (k: "p" | "f" | "c") => (days.length >= 3 ? days.reduce((a, d) => a + d[k], 0) / days.length : null);
  const checks = (await all("recovery_checkins")).filter((c) => inW(c.date));
  const sleep = [...checks.map((c) => c.sleepHours).filter((x): x is number => x != null), ...(await all("sleep_records")).filter((s) => inW(s.date)).map((s) => s.durationMin / 60)];
  const steps = (await all("daily_activity")).filter((d) => inW(d.date) && d.steps);
  const loads = dailyLoads(await all("endurance_sessions"), sessions);
  const sumLoad = (from: string, to: string) => Object.values(loads).filter((l) => l.date >= from && l.date <= to).reduce((a, l) => a + l.load, 0);
  const thisLoad = sumLoad(ws, we);
  const prevAvg = sumLoad(addDays(ws, -28), addDays(ws, -1)) / 4;
  const t0 = startOfLocalDay(ws, tz);
  const t1 = startOfLocalDay(addDays(we, 1), tz);
  const rs = (await readingsBetween(t0, t1)).map((r) => ({ ms: Date.parse(r.ts), mgdl: r.valueMgdl, originalValue: r.originalValue, originalUnit: r.originalUnit }));
  const dia = await tbl("diabetes_settings").get("me");
  const m = rs.length ? computeMetrics(rs, t0, t1, { veryLow: dia?.veryLow ?? 54, low: dia?.targetLow ?? 70, high: dia?.targetHigh ?? 180, veryHigh: dia?.veryHigh ?? 250 }, 15) : null;
  const targets = await currentTargets();
  return {
    weekStart: ws,
    planned: items.filter((i) => i.status !== "cancelled").length + items.filter((i) => i.status === "cancelled").length,
    done: items.filter((i) => i.status === "done").length,
    missed: items.filter((i) => (i.status === "planned" && i.date < addDays(we, 1)) || i.status === "cancelled").length,
    strengthSessions: sessions.filter((s) => inW(s.date)).length,
    runKm: end.filter((e) => e.sport === "run").reduce((a, e) => a + (e.distanceM ?? 0) / 1000, 0),
    bikeMin: end.filter((e) => e.sport === "bike").reduce((a, e) => a + e.durationSec / 60, 0),
    walkMin: end.filter((e) => e.sport === "walk" || e.sport === "treadmill").reduce((a, e) => a + e.durationSec / 60, 0),
    newBests,
    weightDays: new Set(weights.map((w) => w.date)).size,
    trendDeltaKg: tStart != null && tEnd != null ? Math.round((tEnd - tStart) * 100) / 100 : null,
    proteinAvgG: avg("p"), proteinLowG: targets.proteinG?.[0] ?? null, fiberAvgG: avg("f"), carbsAvgG: avg("c"),
    mealsLoggedDays: byDay.size,
    sleepAvgH: sleep.length ? sleep.reduce((a, b) => a + b, 0) / sleep.length : null,
    fatigueAvg: checks.length ? checks.reduce((a, c) => a + (c.fatigue ?? 0), 0) / checks.length : null,
    hardConsecutive: validateWeek(items, { weekStart: ws }).some((v) => v.rule === "R1"),
    loadJumpPct: prevAvg > 0 ? ((thisLoad - prevAvg) / prevAvg) * 100 : null,
    cgm: m && m.n ? { tir: m.pct.in, tbr: m.pctBelow70, tar: m.pctAbove180, cv: m.cv, coverage: m.coveragePct, days: m.days } : null,
    stepsAvg: steps.length ? steps.reduce((a, d) => a + (d.steps ?? 0), 0) / steps.length : null,
  };
}
