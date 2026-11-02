import { beforeEach, describe, expect, it, vi } from "vitest";
import { runChatTurn, validateRequest } from "@/lib/server/ai/chat";
import { toAnthropicMessages } from "@/lib/server/ai/anthropic";
import { toOpenAIInput } from "@/lib/server/ai/openai";
import { ProviderError, type ProviderInput, type ProviderResult } from "@/lib/server/ai/types";
import { TOOLS, jsonSchemaFor, strictSchema, validateToolInput, type ChatItem, type ChatRequest } from "@/lib/ai/tools";
import { NexoDB, setDbForTests } from "@/lib/db/db";
import { ensureInitialized, resetInitForTests } from "@/lib/db/init";
import { put, all } from "@/lib/db/repo";
import { executeTool } from "@/lib/ai/client-tools";
import { BLOCKED_NUTRITION_RESPONSE, BLOCKED_RESPONSE, EMERGENCY_RESPONSE, scanOutput } from "@/lib/domain/safety/guardrails";
import { acceptProposal } from "@/lib/services/plan";
import { tbl } from "@/lib/db/db";
import { addDays, localDate, weekStartOf } from "@/lib/domain/time";

const meta = { assumptions: [], data_used: ["plan"], warnings: [], confidence: "medium", requires_user_approval: true, created_at: "2026-11-01" };
const req = (items: ChatItem[], consents: ChatRequest["context"]["consents"] = { ai_assistant: true, ai_training: true }): ChatRequest => ({ items, context: { today: "2026-11-01", timezone: "Europe/Madrid", consents, unit: "mg/dL" } });
const fake = (r: Partial<ProviderResult>) => vi.fn(async (_: ProviderInput): Promise<ProviderResult> => ({ raw: [], text: "", toolCalls: [], usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 }, stop: "end_turn", model: "claude-opus-5-5", ...r }));

describe("servidor del asistente", () => {
  it("emergencia: responde con texto fijo sin llamar al modelo", async () => {
    const call = fake({ text: "x" });
    const r = await runChatTurn(req([{ role: "user", text: "Mi pareja está inconsciente y es diabética" }]), call);
    expect(r.emergency).toBe(EMERGENCY_RESPONSE);
    expect(call).not.toHaveBeenCalled();
  });
  it("bloquea respuestas con dosis de insulina", async () => {
    const r = await runChatTurn(req([{ role: "user", text: "¿cuánto me pongo?" }]), fake({ text: "Antes de correr ponte 2 unidades menos de insulina rápida." }));
    expect(r.item!.text).toBe(BLOCKED_RESPONSE);
    expect(r.item!.guardrail).toBe(true);
  });
  it("bloquea compensar comida con ejercicio o saltarse comidas, sin bloquear el consejo sano", async () => {
    const r = await runChatTurn(req([{ role: "user", text: "me he pasado con la grasa" }]), fake({ text: "Puedes quemar esas calorías haciendo 40 minutos más de cardio esta tarde." }));
    expect(r.item!.text).toBe(BLOCKED_NUTRITION_RESPONSE);
    for (const bad of ["Entrena más intenso hoy para compensar el desayuno.", "Lo mejor es que te saltes... no: sáltate la cena.", "Haz un ayuno hasta mañana.", "Hoy no cenes y listo.", "Haz la tirada más larga para quemar las rosquillas.", "Para compensar, haz series de 400 m a tope.", "Compensa con una hora de bici.", "Haz 60 minutos de cinta para quemar la comida."]) {
      expect(scanOutput(bad).ok, bad).toBe(false);
    }
    for (const good of ["Sin saltarte comidas, elige una cena con menos grasa.", "No te saltes la cena: mejor una opción a la plancha.", "Mantén tu entrenamiento como estaba planificado.", "La cena puede llevar menos aceite para compensar el día.", "Si te apetece, 15 minutos de trote suave en cinta compensan parte del exceso.", "Puedes compensar una parte caminando 25 min en cinta con inclinación."]) {
      expect(scanOutput(good).ok, good).toBe(true);
    }
  });
  it("deja pasar respuestas descriptivas", async () => {
    const r = await runChatTurn(req([{ role: "user", text: "¿Qué tal mi semana?" }]), fake({ text: "Hiciste 3 sesiones de fuerza y 18 km de carrera." }));
    expect(r.item!.guardrail).toBe(false);
    expect(r.usage!.costUsd).toBeGreaterThan(0);
  });
  it("marca argumentos de herramientas inválidos, no autorizados o con contenido clínico", async () => {
    const r = await runChatTurn(req([{ role: "user", text: "cambia el plan" }], { ai_assistant: true, ai_training: true }), fake({
      toolCalls: [
        { id: "a", name: "get_training_history", input: { days: 3 } },
        { id: "b", name: "get_cgm_period_summary", input: { days: 14 } },
        { id: "c", name: "propose_schedule_changes", input: { title: "x", summary: "y", reasons: ["reduce la basal un 20 % el día de la tirada"], changes: [{ item_id: "i", date: null, intensity: "easy", duration_min: 30, status: null, notes: null }], meta } },
      ],
    }));
    const [a, b, c] = r.item!.toolCalls;
    expect(a.invalid).toMatch(/days/);
    expect(b.invalid).toMatch(/no autorizada/);
    expect(c.blocked).toBe(true);
  });
  it("solo ofrece herramientas de categorías consentidas", async () => {
    const call = fake({ text: "ok" });
    await runChatTurn(req([{ role: "user", text: "hola" }], { ai_assistant: true }), call);
    const names = call.mock.calls[0][0].tools.map((t) => t.name);
    expect(names).toContain("get_user_profile_summary");
    expect(names).not.toContain("get_cgm_period_summary");
    expect(names).not.toContain("propose_schedule_changes");
  });
  it("propaga fallos del proveedor como error controlado", async () => {
    const call = vi.fn(async () => { throw new ProviderError(429, "saturado"); });
    await expect(runChatTurn(req([{ role: "user", text: "hola" }]), call)).rejects.toMatchObject({ status: 429 });
  });
  it("valida la forma de la petición", () => {
    expect(validateRequest({})).toMatch(/mal formada/);
    expect(validateRequest({ items: [{ role: "user", text: "x".repeat(9000) }], context: {} })).toMatch(/largo/);
  });
});

describe("esquemas y conversión de transcript", () => {
  it("los esquemas estrictos no llevan restricciones no admitidas ni campos de insulina", () => {
    for (const t of TOOLS) {
      const s = JSON.stringify(strictSchema(jsonSchemaFor(t)));
      expect(s).not.toMatch(/"(minimum|maximum|minLength|maxLength|pattern|maxItems)"/);
      expect(s).not.toMatch(/\b(insulin\w*|dose|dosis|bolus|bolo|basal|ratio)\b/i);
      expect(s).toMatch(/"additionalProperties":false/);
    }
  });
  it("meta exige requires_user_approval = true", () => {
    const bad = validateToolInput("save_user_note", { kind: "general", text: "x", extra: 1 });
    expect(bad.ok).toBe(false);
    const p = { title: "t", summary: "s", reasons: ["r"], changes: [{ item_id: "i", date: null, intensity: null, duration_min: null, status: "cancelled", notes: null }], meta: { ...meta, requires_user_approval: false } };
    expect(validateToolInput("propose_schedule_changes", p).ok).toBe(false);
    expect(validateToolInput("propose_schedule_changes", { ...p, meta }).ok).toBe(true);
  });
  it("convierte el transcript para Claude y OpenAI conservando bloques crudos", () => {
    const items: ChatItem[] = [
      { role: "user", text: "hola" },
      { role: "assistant", text: "", toolCalls: [{ id: "toolu_1", name: "get_user_profile_summary", input: {} }], provider: "anthropic", raw: [{ type: "thinking", thinking: "", signature: "s" }, { type: "tool_use", id: "toolu_1", name: "get_user_profile_summary", input: {} }] },
      { role: "tool", results: [{ id: "toolu_1", name: "get_user_profile_summary", content: "{}" }] },
    ];
    const a = toAnthropicMessages(items);
    expect(a[1].content).toEqual(items[1].role === "assistant" ? items[1].raw : null);
    expect(a[2]).toMatchObject({ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1" }] });
    const o = toOpenAIInput(items);
    expect(o.some((x) => "type" in x && x.type === "function_call" && x.call_id === "toolu_1")).toBe(true);
    expect(o.some((x) => "type" in x && x.type === "function_call_output")).toBe(true);
  });
});

let n = 0;
describe("herramientas en cliente", () => {
  beforeEach(async () => {
    const db = new NexoDB(`ai-${++n}`);
    setDbForTests(db);
    resetInitForTests();
    await db.open();
    await ensureInitialized();
  });
  const grant = async (...kinds: string[]) => { for (const k of kinds) await put("consents", { id: k, kind: k as never, granted: true, grantedAt: null, revokedAt: null, version: 1 }); };

  it("rechaza herramientas sin consentimiento", async () => {
    const r = await executeTool({ id: "1", name: "get_training_history", input: { days: 14 } });
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/no ha autorizado/);
  });
  it("la glucosa solo se entrega agregada", async () => {
    await grant("ai_assistant", "ai_cgm");
    const r = await executeTool({ id: "1", name: "get_cgm_period_summary", input: { days: 14 } });
    expect(JSON.parse(r.content).available).toBe(false);
  });
  it("las propuestas de plan se validan con las reglas y nunca se aplican solas", async () => {
    await grant("ai_assistant", "ai_training");
    const ws = weekStartOf(localDate());
    const mk = (id: string, d: number, intensity: "hard" | "easy") => put("planned_items", { id, date: addDays(ws, d), weekStart: ws, kind: "run", title: id, intensity, durationMin: 40, sortOrder: d, status: "planned", locked: false, source: "rules" });
    await mk("a", 0, "hard");
    await mk("b", 2, "hard");
    await mk("c", 4, "easy");
    const bad = await executeTool({ id: "1", name: "propose_schedule_changes", input: { title: "x", summary: "y", reasons: ["r"], changes: [{ item_id: "b", date: addDays(ws, 1), intensity: null, duration_min: null, status: null, notes: null }], meta } });
    expect(bad.isError).toBe(true);
    expect(bad.content).toMatch(/consecutivos/);
    const ok = await executeTool({ id: "2", name: "propose_schedule_changes", input: { title: "Suavizar", summary: "y", reasons: ["cansancio"], changes: [{ item_id: "b", date: null, intensity: "easy", duration_min: 30, status: null, notes: null }], meta } });
    expect(ok.isError).toBeFalsy();
    const props = await all("proposals");
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({ status: "pending", origin: "ai", requiresApproval: true });
    const items = await all("planned_items");
    expect(items.find((i) => i.id === "b")!.intensity).toBe("hard");
  });
  it("las rutinas propuestas solo usan ejercicios existentes", async () => {
    await grant("ai_assistant", "ai_training");
    const r = await executeTool({ id: "1", name: "draft_training_plan", input: { name: "X", description: "d", days: [{ title: "A", subtitle: "", focus: "full", items: [{ exercise_id: "inventado", sets: 3, reps_min: 8, reps_max: 12, rir: 2, rest_sec: 90, notes: null }] }], meta } });
    expect(r.isError).toBe(true);
  });
  it("registra lo comido (base de datos + estimación) como propuesta y sustituye la comida prevista al aceptar", async () => {
    await grant("ai_assistant", "ai_nutrition");
    const today = localDate();
    const plan = await put("meal_plans", { weekStart: weekStartOf(today), generatedAt: new Date().toISOString(), settings: {}, generatorVersion: "t" });
    const planned = await put("meal_entries", { mealPlanId: plan.id, date: today, slot: "breakfast", recipeId: "avena-yogur-frutos-rojos", servings: 1, locked: false, status: "planned" });
    const input = {
      date: null, time_hhmm: "08:30", slot: "breakfast", title: "Tostadas, café y tortilla francesa",
      items: [
        { description: "2 tostadas de pan", food_id: "bread_white", grams: 60, estimate: null },
        { description: "tortilla francesa de 2 huevos", food_id: "egg", grams: 100, estimate: null },
        { description: "café con leche", food_id: null, grams: 200, estimate: { kcal: 70, protein_g: 4, carbs_available_g: 6, fat_g: 3.5, fiber_g: 0 } },
      ],
      replaces_planned_meal: true, meta,
    };
    const r = await executeTool({ id: "1", name: "log_meal_estimate", input });
    expect(r.isError).toBeFalsy();
    expect(r.content).toMatch(/kcal/);
    expect(await all("food_logs")).toHaveLength(0); // nada se aplica solo
    const p = (await all("proposals")).find((x) => x.kind === "ai_food_log")!;
    expect(p.warnings.join(" ")).toMatch(/estimad/i);
    expect((await acceptProposal(p.id)).ok).toBe(true);
    const logs = await all("food_logs");
    expect(logs).toHaveLength(1);
    expect(logs[0].source).toBe("estimated");
    expect(logs[0].totals.kcal).toBeGreaterThan(300);
    expect((await tbl("meal_entries").get(planned.id))!.status).toBe("replaced");
    const bal = JSON.parse((await executeTool({ id: "2", name: "get_day_balance", input: { date: null } })).content);
    expect(bal.logged).toHaveLength(1);
    expect(bal.remaining_planned.every((m: { slot: string }) => m.slot !== "breakfast")).toBe(true);
    expect(bal.rules).toMatch(/ejercicio/i);
  });
  it("rechaza estimaciones incoherentes o imposibles y comidas futuras", async () => {
    await grant("ai_assistant", "ai_nutrition");
    const base = { date: null, time_hhmm: null, slot: "snack", title: "Rosquillas", replaces_planned_meal: false, meta };
    const bad = await executeTool({ id: "1", name: "log_meal_estimate", input: { ...base, items: [{ description: "2 rosquillas", food_id: null, grams: 80, estimate: { kcal: 100, protein_g: 5, carbs_available_g: 40, fat_g: 15, fiber_g: null } }] } });
    expect(bad.isError).toBe(true);
    expect(bad.content).toMatch(/incoherente/);
    const ok = await executeTool({ id: "2", name: "log_meal_estimate", input: { ...base, items: [{ description: "2 rosquillas", food_id: null, grams: 80, estimate: { kcal: 340, protein_g: 5, carbs_available_g: 42, fat_g: 16, fiber_g: null } }] } });
    expect(ok.isError).toBeFalsy();
    const future = await executeTool({ id: "3", name: "log_meal_estimate", input: { ...base, date: addDays(localDate(), 2), items: [{ description: "x", food_id: "egg", grams: 50, estimate: null }] } });
    expect(future.isError).toBe(true);
    const missing = await executeTool({ id: "4", name: "log_meal_estimate", input: { ...base, items: [{ description: "churros", food_id: null, grams: 100, estimate: null }] } });
    expect(missing.isError).toBe(true);
  });
  it("las variantes de ingredientes avisan si cambian los hidratos de la comida", async () => {
    await grant("ai_assistant", "ai_nutrition");
    const today = localDate();
    const plan = await put("meal_plans", { weekStart: weekStartOf(today), generatedAt: new Date().toISOString(), settings: {}, generatorVersion: "t" });
    await put("meal_entries", { mealPlanId: plan.id, date: today, slot: "dinner", recipeId: "salmon-patata-judias", servings: 1, locked: false, status: "planned" });
    const r = await executeTool({ id: "1", name: "propose_meal_variant", input: { date: today, slot: "dinner", name: "Tortilla con pan", reason: "No tengo salmón", ingredients: [{ food_id: "egg", grams: 150 }, { food_id: "bread_white", grams: 200 }], meta } });
    expect(r.isError).toBeFalsy();
    const p = (await all("proposals")).find((x) => x.kind === "ai_meal_variant")!;
    expect(p.warnings.join(" ")).toMatch(/hidratos/);
    expect((await acceptProposal(p.id)).ok).toBe(true);
    const e = (await all("meal_entries")).find((m) => m.slot === "dinner")!;
    expect(e.replacedFrom).toBe("salmon-patata-judias");
    expect((await all("recipe_ingredients")).filter((i) => i.recipeId === e.recipeId)).toHaveLength(2);
  });
});

describe("acceso al asistente con código personal", () => {
  it("acepta el código correcto, rechaza el incorrecto y exige longitud mínima", async () => {
    const { authorize, accessCodeConfigured } = await import("@/lib/server/auth");
    const prev = process.env.AI_ACCESS_CODE;
    process.env.AI_ACCESS_CODE = "corto";
    expect(accessCodeConfigured()).toBe(false);
    process.env.AI_ACCESS_CODE = "codigo-largo-de-prueba-123";
    const mk = (code?: string) => new Request("http://x/api/ai/chat", { method: "POST", headers: code ? { "x-nexo-access": code } : {} });
    expect(await authorize(mk("codigo-largo-de-prueba-123"))).toMatchObject({ key: "code:owner" });
    expect(await authorize(mk("otro-codigo-cualquiera-xx"))).toMatchObject({ status: 401 });
    expect(await authorize(mk())).toMatchObject({ status: 401 });
    process.env.AI_ACCESS_CODE = prev;
  });
});

describe("compensación con actividad suave", () => {
  beforeEach(async () => {
    const db = new NexoDB(`comp-${++n}`);
    setDbForTests(db);
    resetInitForTests();
    await db.open();
    await ensureInitialized();
  });
  it("solo propone la actividad calculada por la app y si hay exceso", async () => {
    for (const k of ["ai_assistant", "ai_training", "ai_nutrition"]) await put("consents", { id: k, kind: k as never, granted: true, grantedAt: null, revokedAt: null, version: 1 });
    const none = await executeTool({ id: "1", name: "propose_compensation_activity", input: { option: "easy_jog", reason: "me pasé" } });
    expect(none.isError).toBe(true);
    // perfil completo + comida abundante registrada hoy
    const { patch } = await import("@/lib/db/repo");
    await patch("profiles", "me", { birthDate: "1990-01-01", heightCm: 178, sex: "male" });
    await put("weight_entries", { date: localDate(), measuredAt: new Date().toISOString(), weightKg: 80, source: "manual" });
    await put("food_logs", { date: localDate(), eatenAt: new Date().toISOString(), slot: "lunch", mealEntryId: null, recipeId: null, servings: null, items: [], title: "Banquete", totals: { kcal: 3600, proteinG: 100, carbsAvailableG: 300, fiberG: 10, fatG: 200, satFatG: 0, sugarsG: 0, saltG: 0, missing: [] }, source: "manual", note: null });
    const bal = JSON.parse((await executeTool({ id: "2", name: "get_day_balance", input: { date: null } })).content);
    expect(bal.energy.verdict).toBe("over");
    expect(bal.compensation.pct_of_excess).toBeLessThanOrEqual(30);
    expect(bal.compensation.options.every((o: { minutes: number }) => o.minutes >= 10 && o.minutes <= 30)).toBe(true);
    const ok = await executeTool({ id: "3", name: "propose_compensation_activity", input: { option: "easy_jog", reason: "me pasé en la comida" } });
    expect(ok.isError).toBeFalsy();
    const p = (await all("proposals")).find((x) => x.kind === "ai_compensation")!;
    expect(p.ops[0]).toMatchObject({ op: "create", table: "planned_items", record: { intensity: "easy" } });
    expect((p.ops[0] as unknown as { record: { durationMin: number } }).record.durationMin).toBeLessThanOrEqual(30);
  });
});
