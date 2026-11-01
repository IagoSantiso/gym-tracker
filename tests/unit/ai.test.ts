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
import { BLOCKED_RESPONSE, EMERGENCY_RESPONSE } from "@/lib/domain/safety/guardrails";
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
});
