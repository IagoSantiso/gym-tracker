import { beforeEach, describe, expect, it } from "vitest";
import { validateRequest } from "@/lib/server/ai/chat";
import { toAnthropicMessages } from "@/lib/server/ai/anthropic";
import { toOpenAIInput } from "@/lib/server/ai/openai";
import { conversationForStorage } from "@/lib/ai/client";
import { FoodProduct } from "@/lib/ai/food-product";
import { MAX_ATTACHMENT_CHARS, type ChatAttachment } from "@/lib/ai/attachments";
import { executeTool } from "@/lib/ai/client-tools";
import type { ChatItem } from "@/lib/ai/tools";
import { NexoDB, setDbForTests, tbl } from "@/lib/db/db";
import { ensureInitialized, resetInitForTests } from "@/lib/db/init";
import { all, patch, put } from "@/lib/db/repo";
import { acceptProposal, revertProposal } from "@/lib/services/plan";
import { generateWeekMenu, loadCatalog, weekMeals } from "@/lib/services/nutrition";
import { localDate, weekStartOf } from "@/lib/domain/time";

const meta = { assumptions: [], data_used: ["Etiqueta del usuario"], warnings: [], confidence: "medium", requires_user_approval: true, created_at: "2026-11-02" };
const tuna = {
  name: "Atún en aceite escurrido", brand: "Marca prueba", barcode: null,
  state: "as_sold", weight_basis: "drained", carb_basis: "available",
  per100: { kcal: 200, proteinG: 25, fatG: 11, carbsAvailableG: 0, carbsTotalG: null, fiberG: null, satFatG: 2, sugarsG: 0, saltG: 1 },
  allergens: ["pescado"], allergens_known: true, provenance: "label", evidence: "Etiqueta legible, datos por 100 g escurridos",
};
const attachments: ChatAttachment[] = [
  { kind: "image", name: "nevera.jpg", mediaType: "image/jpeg", data: Buffer.from([255, 216, 255, 0]).toString("base64") },
  { kind: "pdf", name: "etiqueta.pdf", mediaType: "application/pdf", data: Buffer.from("%PDF-1.7\n").toString("base64") },
  { kind: "text", name: "productos.txt", mediaType: "text/plain", text: "Garbanzos y lechuga" },
];
const request = (files: unknown = attachments) => ({ items: [{ role: "user", text: "Prepara mi cena", attachments: files }], context: {} });

describe("adjuntos del asistente", () => {
  it("valida tipos, contenido real, cantidad y presupuesto de la conversación", () => {
    expect(typeof validateRequest(request())).toBe("object");
    expect(typeof validateRequest(request([{ ...attachments[0], mediaType: "image/svg+xml" }]))).toBe("string");
    expect(typeof validateRequest(request([{ ...attachments[0], data: Buffer.from("HTML falso").toString("base64") }]))).toBe("string");
    expect(typeof validateRequest(request(Array(5).fill(attachments[0])))).toBe("string");
    expect(typeof validateRequest(request([{ ...attachments[0], data: "a".repeat(MAX_ATTACHMENT_CHARS + 1) }]))).toBe("string");
    const big = { ...attachments[2], text: "x".repeat(50_000) };
    expect(typeof validateRequest({ items: Array(15).fill({ role: "user", text: "", attachments: Array(4).fill(big) }), context: {} })).toBe("string");
  });
  it("convierte imagen, PDF y texto para ambos proveedores sin perderlos durante las herramientas", () => {
    const items = request().items as ChatItem[];
    const a = JSON.stringify(toAnthropicMessages(items));
    const o = JSON.stringify(toOpenAIInput(items));
    expect(a).toContain('"type":"image"');
    expect(a).toContain('"type":"document"');
    expect(o).toContain('"type":"input_image"');
    expect(o).toContain('"type":"input_file"');
    for (const result of [a, o]) expect(result).toContain("Garbanzos y lechuga");
  });
  it("no conserva datos de adjuntos en historial, exportaciones ni sync", () => {
    const items = request().items as ChatItem[];
    const stored = JSON.stringify(conversationForStorage(items));
    expect(stored).not.toContain("Garbanzos y lechuga");
    expect(stored).not.toContain(attachments[0].kind === "image" ? attachments[0].data : "imposible");
    expect(stored).toContain("Adjuntos no conservados");
    expect(stored).toContain("nevera.jpg");
    expect(items[0].role === "user" && items[0].attachments).toHaveLength(3);
  });
});

let n = 0;
describe("productos nuevos y cena en una propuesta", () => {
  beforeEach(async () => {
    const db = new NexoDB(`inputs-${++n}`);
    setDbForTests(db); resetInitForTests(); await db.open(); await ensureInitialized();
    for (const kind of ["ai_assistant", "ai_nutrition"] as const) await put("consents", { id: kind, kind, granted: true, grantedAt: null, revokedAt: null, version: 1 });
  });
  it("rechaza nutrientes incoherentes y totales sin fibra sin inventar ceros", () => {
    expect(FoodProduct.safeParse(tuna).success).toBe(true);
    expect(FoodProduct.safeParse({ ...tuna, per100: { ...tuna.per100, fatG: 99 } }).success).toBe(false);
    expect(FoodProduct.safeParse({ ...tuna, carb_basis: "total", per100: { ...tuna.per100, carbsAvailableG: null, carbsTotalG: 10 } }).success).toBe(false);
  });
  it("guarda productos solo al aceptar y los hace disponibles para herramientas posteriores", async () => {
    const r = await executeTool({ id: "1", name: "propose_food_products", input: { products: [{ key: "new:tuna", product: tuna }], meta } });
    expect(r.isError).toBeFalsy();
    expect(await all("foods")).toHaveLength(0);
    const [proposal] = await all("proposals");
    expect(proposal.status).toBe("pending");
    expect((await acceptProposal(proposal.id)).ok).toBe(true);
    const catalog = await loadCatalog();
    const food = catalog.foods.find((f) => f.name.includes("Atún en aceite escurrido"))!;
    expect(food.per100.fatG).toBe(11);
    expect(food.per100.fiberG).toBeNull();
    await revertProposal(proposal.id);
    expect(await all("foods")).toHaveLength(0);
  });
  it("atún y garbanzos de etiqueta → cena con cálculos reales sin aplicar cambios hasta aceptar", async () => {
    const ws = weekStartOf(localDate());
    await generateWeekMenu(ws, { kcalTarget: null, keepLocked: true });
    const meal = (await weekMeals(ws)).find((m) => m.date === localDate() && m.slot === "dinner")!;
    const chickpeas = { ...tuna, name: "Garbanzos cocidos escurridos", allergens: [], per100: { ...tuna.per100, kcal: 120, proteinG: 6, fatG: 2, carbsAvailableG: 17, fiberG: 5, satFatG: 0.3, sugarsG: 1 } };
    const r = await executeTool({ id: "2", name: "propose_meal_variant", input: {
      date: meal.date, slot: "dinner", name: "Atún con garbanzos", reason: "Productos disponibles del usuario",
      ingredients: [{ food_id: "new:tuna", grams: 100 }, { food_id: "new:chickpeas", grams: 150 }],
      new_products: [{ key: "new:tuna", product: tuna }, { key: "new:chickpeas", product: chickpeas }], meta,
    } });
    expect(r.isError, r.content).toBeFalsy();
    expect(r.content).toContain("380 kcal");
    const [proposal] = await all("proposals");
    expect(await all("foods")).toHaveLength(0);
    expect((await tbl("meal_entries").get(meal.id))!.recipeId).toBe(meal.recipeId);
    await acceptProposal(proposal.id);
    expect(await all("foods")).toHaveLength(2);
    const updated = (await tbl("meal_entries").get(meal.id))!;
    expect(updated.recipeId).not.toBe(meal.recipeId);
    expect((await loadCatalog()).recipe(updated.recipeId)!.ingredients).toHaveLength(2);
    await revertProposal(proposal.id);
    expect((await tbl("meal_entries").get(meal.id))!.recipeId).toBe(meal.recipeId);
    expect(await all("foods")).toHaveLength(0);
  });
  it("registra una comida ya consumida con un producto nuevo de etiqueta", async () => {
    const r = await executeTool({ id: "log", name: "log_meal_estimate", input: {
      date: localDate(), time_hhmm: null, slot: "lunch", title: "Atún que ya he comido",
      items: [{ description: "Atún en aceite escurrido", food_id: "new:tuna", grams: 50, estimate: null }],
      new_products: [{ key: "new:tuna", product: tuna }], replaces_planned_meal: false, meta,
    } });
    expect(r.isError, r.content).toBeFalsy();
    expect(r.content).toContain("100 kcal");
    expect(await all("food_logs")).toHaveLength(0);
    const [proposal] = await all("proposals");
    await acceptProposal(proposal.id);
    const [log] = await all("food_logs");
    expect(log.totals.kcal).toBe(100);
    expect(log.totals.fatG).toBe(5.5);
    expect(await tbl("foods").get(log.items![0].foodId)).toBeDefined();
  });
  it("impide introducir productos con alérgenos excluidos", async () => {
    await patch("preferences", "me", { allergies: ["pescado"] });
    const r = await executeTool({ id: "3", name: "propose_food_products", input: { products: [{ key: "new:tuna", product: tuna }], meta } });
    expect(r.isError).toBe(true);
    expect(await all("proposals")).toHaveLength(0);
  });
  it("si falla una operación al aceptar no deja productos guardados a medias", async () => {
    const proposal = await put("proposals", { domain: "nutrition", kind: "test", title: "Fallo simulado", summary: "", reasons: [], dataUsed: [], assumptions: [], warnings: [], confidence: "medium", status: "pending", origin: "ai", requiresApproval: true, ops: [
      { op: "create", table: "foods", record: { id: "temp-food", name: "Temporal" } },
      { op: "create", table: "recipes", record: { id: {} } },
    ] });
    await expect(acceptProposal(proposal.id)).rejects.toThrow();
    expect(await tbl("foods").get("temp-food")).toBeUndefined();
    expect((await tbl("proposals").get(proposal.id))!.status).toBe("pending");
  });
});
