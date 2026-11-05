import type { FoodLog, NutrientTotals } from "@/lib/db/types";

export const hasUnknownEnergy = (log: Pick<FoodLog, "totals">) =>
  log.totals.missing.some(
    (m) => m === "kcal" || m.startsWith("kcal:") || m.startsWith("*:"),
  );
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
/** Stable snapshot: favorites/stock metadata cannot invalidate a confirmed diary; edits/deletions can. */
export function diarySignature(logs: FoodLog[]): string {
  return JSON.stringify(
    [...logs]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((l) => [
        l.id,
        l.date,
        l.eatenAt,
        l.slot,
        l.title,
        canonical(l.items),
        canonical(l.totals),
      ]),
  );
}
export function dailyBudget(
  intake: number,
  target: [number, number] | null,
  count: number,
  unknown: boolean,
  confirmed: boolean,
  spent: number | null,
) {
  const remaining = target
    ? (target.map((n) => Math.round(n - intake)) as [number, number])
    : null;
  const status = !count
    ? "empty"
    : unknown
      ? "incomplete"
      : !target
        ? "no_target"
        : intake > target[1]
          ? "above"
          : intake >= target[0]
            ? "in_range"
            : "remaining";
  return {
    intake: Math.round(intake),
    target,
    remaining,
    status,
    confirmed,
    unknown,
    balance:
      confirmed && !unknown && spent != null
        ? Math.round(intake - spent)
        : null,
  };
}
export function scaleNutrition(
  t: NutrientTotals,
  factor: number,
): NutrientTotals {
  if (!Number.isFinite(factor) || factor <= 0 || factor > 100)
    throw new Error("Revisa la cantidad.");
  return Object.fromEntries(
    Object.entries(t).map(([k, v]) => [
      k,
      k === "missing" ? [...t.missing] : (v as number) * factor,
    ]),
  ) as unknown as NutrientTotals;
}
