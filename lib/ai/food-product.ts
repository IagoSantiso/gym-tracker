import { z } from "zod";
import type { Food } from "@/lib/db/types";

const grams = z.number().min(0).max(100);
export const FoodProduct = z.strictObject({
  name: z.string().trim().min(1).max(120),
  brand: z.string().max(80).nullable(),
  barcode: z.string().regex(/^\d{8,14}$/).nullable(),
  state: z.enum(["raw", "cooked", "as_sold"]),
  weight_basis: z.enum(["as_sold", "drained", "prepared"]),
  carb_basis: z.enum(["available", "total"]),
  per100: z.strictObject({
    kcal: z.number().min(0).max(900), proteinG: grams, fatG: grams,
    carbsAvailableG: grams.nullable(), carbsTotalG: grams.nullable(),
    fiberG: grams.nullable(), satFatG: grams.nullable(), sugarsG: grams.nullable(), saltG: grams.nullable(),
  }),
  allergens: z.array(z.enum(["gluten", "lactosa", "huevo", "pescado", "marisco", "frutos_secos", "cacahuete", "soja", "sesamo"])).max(9),
  allergens_known: z.boolean(),
  provenance: z.enum(["label", "user", "estimated"]),
  evidence: z.string().trim().min(1).max(400),
}).superRefine((p, ctx) => {
  const n = p.per100;
  const carbs = n.carbsAvailableG ?? (p.carb_basis === "available" ? n.carbsTotalG : n.carbsTotalG != null && n.fiberG != null ? n.carbsTotalG - n.fiberG : null);
  const err = (message: string) => ctx.addIssue({ code: "custom", message });
  if (carbs == null || carbs < 0) err("Faltan hidratos disponibles o hidratos totales y fibra por 100 g.");
  if (n.proteinG + n.fatG + (carbs ?? 0) + (n.fiberG ?? 0) > 105) err("Los nutrientes superan 100 g por 100 g de producto.");
  if (n.satFatG != null && n.satFatG > n.fatG) err("La grasa saturada supera la grasa total.");
  if (n.sugarsG != null && carbs != null && n.sugarsG > carbs) err("Los azúcares superan los hidratos.");
  const energy = 4 * n.proteinG + 9 * n.fatG + 4 * (carbs ?? 0) + 2 * (n.fiberG ?? 0);
  if (Math.abs(energy - n.kcal) > Math.max(50, n.kcal * 0.35)) err("La energía no es coherente con los nutrientes; revisa la etiqueta.");
});

export const NewProduct = z.strictObject({ key: z.string().regex(/^new:[a-zA-Z0-9_-]{1,40}$/), product: FoodProduct });
export type ProductInput = z.infer<typeof FoodProduct>;

export function productRecord(p: ProductInput, id = crypto.randomUUID()): Omit<Food, "createdAt" | "updatedAt"> {
  return {
    id, name: p.brand ? `${p.name} (${p.brand})` : p.name, brand: p.brand, barcode: p.barcode,
    state: p.state, per100: p.per100, carbBasis: p.carb_basis, sourceId: "label",
    sourceRef: p.evidence, retrievedAt: new Date().toISOString(), section: "otros",
    tags: ["producto-propio", p.provenance], allergens: p.allergens,
    notes: `Valores por 100 g · base: ${p.weight_basis}. ${p.evidence}${p.allergens_known ? "" : " · Alérgenos sin verificar."}`,
    source: p.provenance === "estimated" ? "estimated" : p.provenance === "label" ? "imported" : "manual",
  };
}
