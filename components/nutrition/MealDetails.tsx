"use client";
import type { NutrientTotals } from "@/lib/db/types";
import type { Catalog } from "@/lib/services/nutrition";
import { fmtNutrient } from "@/lib/domain/nutrition/calc";
import { portionLines } from "@/lib/domain/nutrition/portions";
export function NutrientLine({ t, compact }: { t: NutrientTotals; compact?: boolean }) {
  return (
    <span className="small">
      <b>{fmtNutrient("carbsAvailableG", t.carbsAvailableG)} g</b> hidratos disp. · {fmtNutrient("kcal", t.kcal)} kcal · {fmtNutrient("proteinG", t.proteinG)} g prot.
      {!compact && <> · {fmtNutrient("fiberG", t.fiberG)} g fibra · {fmtNutrient("fatG", t.fatG)} g grasa · sal {fmtNutrient("saltG", t.saltG)} g</>}
      {t.missing.length > 0 && <span className="xs dim" title={t.missing.join(", ")}> · datos incompletos</span>}
    </span>
  );
}

export function Portions({ recipeIngredients, cat, servings, baseServings, open, onIngredient }: { onIngredient?: (index: number) => void; recipeIngredients: { foodId: string; grams: number; note?: string | null }[]; cat: Catalog; servings: number; baseServings: number; open?: boolean }) {
  const lines = portionLines(recipeIngredients, cat.food, servings, baseServings);
  if (!lines.length) return null;
  return (
    <details open={open} className="portions">
      <summary className="xs" style={{ cursor: "pointer", fontWeight: 650 }}>Cantidades ({lines.length} ingredientes)</summary>
      <ul className="small" style={{ margin: "4px 0 0", paddingLeft: 18 }}>
        {lines.map((l, i) => (
          <li key={`${l.foodId}-${i}`}>
            <b>{l.label}</b> {onIngredient ? <button className="ingredient-link" onClick={() => onIngredient(i)}>{l.name.toLowerCase()}</button> : l.name.toLowerCase()}
            {l.stateNote && <span className="xs dim"> · {l.stateNote}{l.cookedG ? ` (≈ ${l.cookedG} g cocinado)` : ""}</span>}
            {l.note && <span className="xs dim"> · {l.note}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

